import type { Flags } from "../aff"
import type { CompoundRule } from "../aff/compound-rule"
import { CapType, CompoundPos } from "../constants"
import { Word } from "../dic"
import { replchars } from "../permutations"
import { any, isTriplet, isUppercased } from "../util"
import { affixForms } from "./affixes"
import { AffixForm } from "./forms"
import { LKFlags } from "./lk-flags"
import type { LKWord } from "./lk-word"

/**
 * A hypothesis of how a compound word may be constructed, using an array
 * of {@link AffixForm} instances to denote segements of the word.
 */
export type CompoundForm = AffixForm[]

/** Produces all valid {@link CompoundForm}s for a word. */
export function* compoundForms(word: LKWord, allowNoSuggest = true) {
  const aff = word.aff

  // don't even try to decompose a forbidden word
  // TODO: this is incredibly slow, remove this
  if (aff.FORBIDDENWORD) {
    for (const candidate of affixForms(word, true, true)) {
      if (candidate.flags.has(aff.FORBIDDENWORD)) return
    }
  }

  if (aff.COMPOUNDBEGIN || aff.COMPOUNDFLAG) {
    for (const compound of compoundsByFlags(word, allowNoSuggest)) {
      if (!isBadCompound(word, compound)) {
        yield compound
      }
    }
  }

  if (aff.COMPOUNDRULE.size) {
    for (const compound of compoundsByRules(word)) {
      if (!isBadCompound(word, compound)) {
        yield compound
      }
    }
  }
}
/**
 * Takes this word and yields the {@link CompoundForm}s of it using the
 * `COMPOUNDFLAG`/`COMPOUNDBEGIN|MIDDLE|END` marker system.
 */
function* compoundsByFlags(
  word: LKWord,
  allowNoSuggest = true,
  depth = 0
): Iterable<CompoundForm> {
  const aff = word.aff

  const forbiddenFlags: Flags = new Set<string>()
  const permitFlags: Flags = new Set<string>()

  if (aff.COMPOUNDFORBIDFLAG) forbiddenFlags.add(aff.COMPOUNDFORBIDFLAG)
  if (aff.COMPOUNDPERMITFLAG) permitFlags.add(aff.COMPOUNDPERMITFLAG)

  if (depth) {
    const forms = affixForms(
      word.shift(CompoundPos.END),
      allowNoSuggest,
      false,
      new LKFlags({ prefix: permitFlags, forbidden: forbiddenFlags })
    )

    for (const form of forms) {
      yield [form]
    }
  }

  if (word.length < aff.COMPOUNDMIN * 2) return
  if (aff.COMPOUNDWORDMAX && depth > aff.COMPOUNDWORDMAX) return

  const compoundpos = depth ? CompoundPos.MIDDLE : CompoundPos.BEGIN
  const prefixFlags: Flags = compoundpos === CompoundPos.BEGIN ? new Set() : permitFlags

  for (let pos = aff.COMPOUNDMIN; pos < word.length - aff.COMPOUNDMIN + 1; pos++) {
    const beg = word.slice(0, pos)
    beg.pos = compoundpos

    const rest = word.slice(pos)
    rest.pos = compoundpos

    const flags = LKFlags.from(prefixFlags, permitFlags, forbiddenFlags)

    for (const form of affixForms(beg, allowNoSuggest, false, flags)) {
      for (const partial of compoundsByFlags(rest, allowNoSuggest, depth + 1)) {
        yield [form, ...partial]
      }
    }

    if (aff.SIMPLIFIEDTRIPLE && beg.at(-1) === rest.at(0)) {
      const forms = affixForms(beg.add(beg.at(-1)), allowNoSuggest, false, flags)
      for (const form of forms) {
        for (const partial of compoundsByFlags(rest, allowNoSuggest, depth + 1)) {
          yield [form.replace({ text: beg.word }), ...partial]
        }
      }
    }
  }
}

/**
 * Takes this word and yields the {@link CompoundForm}s of it using the
 * `COMPOUNDRULE` pattern system.
 */
function* compoundsByRules(
  word: LKWord,
  prev: Word[] = [],
  rules?: CompoundRule[]
): Iterable<CompoundForm> {
  const aff = word.aff
  const dic = word.dic

  if (!rules) rules = [...aff.COMPOUNDRULE]

  if (prev.length) {
    for (const homonym of dic.homonyms(word.word)) {
      const parts = [...prev, homonym]
      const flagSets = Word.flagSets(parts)
      if (rules.some(rule => rule.match(flagSets))) {
        yield [new AffixForm(word)]
      }
    }
  }

  if (word.length < aff.COMPOUNDMIN * 2) return
  if (aff.COMPOUNDWORDMAX && prev.length >= aff.COMPOUNDWORDMAX) return

  for (let pos = aff.COMPOUNDMIN; pos < word.length - aff.COMPOUNDMIN + 1; pos++) {
    const beg = word.slice(0, pos)

    for (const homonynm of dic.homonyms(beg.word)) {
      const parts = [...prev, homonynm]
      const flagSets = Word.flagSets(parts)
      const compoundRules = rules.filter(rule => rule.match(flagSets, true))
      if (compoundRules.length) {
        for (const rest of compoundsByRules(word.slice(pos), parts, compoundRules)) {
          yield [new AffixForm(beg), ...rest]
        }
      }
    }
  }
}

/**
 * Determines if a {@link CompoundForm} is invalid for a {@link LKWord}, by
 * various criteria.
 *
 * @param word - The word to validate against.
 * @param compound - The {@link CompoundForm} to check.
 * @param captype - The {@link CapType} of the original word.
 * @see {@link CompoundPattern}
 */
export function isBadCompound(word: LKWord, compound: CompoundForm) {
  const aff = word.aff
  const dic = word.dic

  if (aff.FORCEUCASE && word.type !== CapType.ALL && word.type !== CapType.INIT) {
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

    if (any(affixForms(word.to(`${left} ${right}`)))) {
      return true
    }

    if (aff.CHECKCOMPOUNDREP) {
      for (const candidate of replchars(left + right, aff.REP)) {
        if (typeof candidate !== "string") continue
        if (any(affixForms(word.to(candidate)))) {
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
