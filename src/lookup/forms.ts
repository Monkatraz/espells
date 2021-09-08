import type { Prefix, Suffix } from "../aff/affix"
import { CapType, CompoundPos } from "../constants"
import type { Word } from "../dic/word"
import { replchars } from "../permutations"
import { any, concat, includes, isTriplet, isUppercased } from "../util"
import { LKWord } from "./lk-word"

export interface AffixFormOpts {
  /** Outermost prefix. */
  prefix?: Prefix

  /** Outermost suffix. */
  suffix?: Suffix

  /** Innermost prefix. */
  prefix2?: Prefix

  /** Innermost suffix. */
  suffix2?: Suffix

  /** The word as found in the spellchecker's dictionary. */
  inDictionary?: Word
}

/**
 * Represents a hypothesis of how a word may be represented as a
 * {@link Prefix}, stem, and {@link Suffix}. A word always has a full text
 * and stem, but may optionally have up to two prefixes and suffixes.
 * Instances with no actual affixes are valid, as well.
 */
export class AffixForm {
  /** The full text of the word. */
  declare text: string

  /** The hypothesized stem of the word. */
  declare stem: string

  /** Outermost prefix. */
  declare prefix?: Prefix

  /** Outermost suffix. */
  declare suffix?: Suffix

  /** Innermost prefix. */
  declare prefix2?: Prefix

  /** Innermost suffix. */
  declare suffix2?: Suffix

  /** The word as found in the spellchecker's dictionary. */
  declare inDictionary?: Word

  constructor(
    text: string | LKWord,
    stem?: string,
    { prefix, suffix, prefix2, suffix2, inDictionary }: AffixFormOpts = {}
  ) {
    if (text instanceof LKWord) {
      this.text = text.word
      this.stem = stem ?? text.word
    } else {
      this.text = text
      this.stem = stem ?? text
    }

    this.prefix = prefix
    this.suffix = suffix
    this.prefix2 = prefix2
    this.suffix2 = suffix2
    this.inDictionary = inDictionary
  }

  /**
   * Returns a new {@link AffixForm}, cloned from this current instance, but
   * with any properties given replaced.
   */
  replace(opts: { text?: string | LKWord; stem?: string } & AffixFormOpts) {
    return new AffixForm(opts.text ?? this.text, opts.stem ?? this.stem, {
      prefix: opts.prefix ?? this.prefix,
      suffix: opts.suffix ?? this.suffix,
      prefix2: opts.prefix2 ?? this.prefix2,
      suffix2: opts.suffix2 ?? this.suffix2,
      inDictionary: opts.inDictionary ?? this.inDictionary
    })
  }

  /** True if the form has any affixes. */
  get hasAffixes() {
    return Boolean(this.suffix || this.prefix)
  }

  /** The complete set of flags this form has. */
  get flags() {
    let flags = this.inDictionary?.flags ?? new Set()
    if (this.prefix) flags = concat(flags, this.prefix.flags)
    if (this.suffix) flags = concat(flags, this.suffix.flags)
    return flags
  }

  /** Returns every {@link Prefix} and {@link Suffix} this form has. */
  affixes() {
    return [this.prefix2, this.prefix, this.suffix, this.suffix2].filter(affix =>
      Boolean(affix)
    ) as (Prefix | Suffix)[]
  }

  /**
   * Determines if this form is valid for the {@link LKWord} specified.
   *
   * @param word - The word to validate against.
   * @param allowNoSuggest - If false, words which are in the dictionary,
   *   but are flagged with the `NOSUGGEST` flag (if provided), will not be
   *   considered correct. Defaults to true.
   */
  valid(word: LKWord, allowNoSuggest = true) {
    if (!this.inDictionary) return false

    const aff = word.aff

    const rootFlags = this.inDictionary.flags ?? new Set()
    const allFlags = this.flags

    if (!allowNoSuggest && includes(aff.NOSUGGEST, rootFlags)) return false

    if (
      word.type !== this.inDictionary.capType &&
      includes(aff.KEEPCASE, rootFlags) &&
      !aff.isSharps(this.inDictionary.stem)
    ) {
      return false
    }

    if (aff.NEEDAFFIX) {
      if (this.hasAffixes) {
        if (this.affixes().every(affix => affix.has(aff.NEEDAFFIX))) {
          return false
        }
      } else if (rootFlags.has(aff.NEEDAFFIX)) {
        return false
      }
    }

    if (this.prefix && !allFlags.has(this.prefix.flag)) return false
    if (this.suffix && !allFlags.has(this.suffix.flag)) return false

    if (aff.CIRCUMFIX) {
      const suffixHas = Boolean(this.suffix?.has(aff.CIRCUMFIX))
      const prefixHas = Boolean(this.prefix?.has(aff.CIRCUMFIX))
      if (suffixHas !== prefixHas) return false
    }

    if (word.pos === undefined) {
      if (!includes(aff.ONLYINCOMPOUND, allFlags)) return true
      return false
    }

    if (includes(aff.COMPOUNDFLAG, allFlags)) return true

    let passes = false
    // prettier-ignore
    switch(word.pos) {
        case CompoundPos.BEGIN:  passes = includes(aff.COMPOUNDBEGIN,  allFlags)
        case CompoundPos.MIDDLE: passes = includes(aff.COMPOUNDMIDDLE, allFlags)
        case CompoundPos.END:    passes = includes(aff.COMPOUNDEND,    allFlags)
      }

    return passes
  }
}

/**
 * A hypothesis of how a compound word may be constructed, using an array
 * of {@link AffixForm} instances to denote segements of the word.
 */
export type CompoundForm = AffixForm[]

/**
 * A hypothesis for how a word may be constructed, either as a single
 * {@link AffixForm} or as a {@link CompoundForm} made from multiple
 * {@link AffixForm} instances.
 */
export type WordForm = AffixForm | CompoundForm

/**
 * Determines if a {@link CompoundForm} is invalid for a {@link LKWord}, by
 * various criteria.
 *
 * @param word - The word to validate against.
 * @param compound - The {@link CompoundForm} to check.
 * @param captype - The {@link CapType} of the original word.
 * @see {@link CompoundPattern}
 */
export function isBadCompound(word: LKWord, compound: CompoundForm, captype: CapType) {
  const aff = word.aff
  const dic = word.dic

  if (aff.FORCEUCASE && captype !== CapType.ALL && captype !== CapType.INIT) {
    if (dic.hasFlag(compound[compound.length - 1].text, aff.FORCEUCASE)) {
      return true
    }
  }

  return compound.slice(0, -1).some((leftParadigm, idx) => {
    const left = leftParadigm.text
    const rightParadigm = compound[idx + 1]
    const right = rightParadigm.text

    if (dic.hasFlag(left, aff.COMPOUNDFORBIDFLAG)) {
      return true
    }

    if (any(word.to(`${left} ${right}`, captype).affixForms())) {
      return true
    }

    if (aff.CHECKCOMPOUNDREP) {
      for (const candidate of replchars(left + right, aff.REP)) {
        if (typeof candidate !== "string") continue
        if (any(word.to(candidate, captype).affixForms())) {
          return true
        }
      }
    }

    if (aff.CHECKCOMPOUNDTRIPLE) {
      if (
        isTriplet(`${left.slice(-2)}${right.slice(0, 1)}`) ||
        isTriplet(`${left.slice(-1)}${right.slice(0, 2)}`)
      ) {
        return true
      }
    }

    if (aff.CHECKCOMPOUNDCASE) {
      const rightC = right[0]
      const leftC = left[left.length - 1]
      if (
        (isUppercased(rightC) || isUppercased(leftC)) &&
        rightC !== "-" &&
        leftC !== "-"
      ) {
        return true
      }
    }

    if (aff.CHECKCOMPOUNDPATTERN.size) {
      for (const pattern of aff.CHECKCOMPOUNDPATTERN) {
        if (pattern.match(leftParadigm, rightParadigm)) {
          return true
        }
      }
    }

    if (aff.CHECKCOMPOUNDDUP) {
      if (left === right && idx === compound.length - 2) {
        return true
      }
    }
  })
}
