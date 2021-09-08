import { iterate } from "iterare"
import type { Aff } from "../aff"
import { CapType, CONSTANTS as C } from "../constants"
import type { Dic } from "../dic"
import { any, includes } from "../util"
import { breakWord } from "./decompose"
import { LKWord } from "./lk-word"

/** The resulting data returned from executing a lookup. */
export interface LookupResult {
  /** Indicates if the word was spelled correctly. */
  correct: boolean
  /**
   * Indicates if the word was marked as forbidden with the spellchecker's
   * dictionary.
   */
  forbidden: boolean
  /**
   * Indicates if the word was marked as "warn" in the dictionary, which
   * probably means that the word is *technically* valid but is still
   * likely to have been a mistake.
   */
  warn: boolean
}

/**
 * {@link Lookup} context. Many methods in the {@link Lookup} class share
 * these options.
 */
export interface LKC {
  /** If true, lookups will be case sensitive. */
  caps?: boolean

  /**
   * If false, words which are in the dictionary, but are flagged with the
   * `NOSUGGEST` flag (if provided), will not be considered correct.
   * Defaults to true.
   */
  allowNoSuggest?: boolean

  /**
   * Used by {@link Lookup.forms}. If false, {@link AffixForm} instances
   * won't be yielded. Defaults to true.
   */
  affixForms?: boolean

  /**
   * Used by {@link Lookup.forms}. If false, {@link CompoundForm} instances
   * won't be yielded. Defaults to true.
   */
  compoundForms?: boolean

  /**
   * Used by {@link Lookup.affixForms}. If true, {@link AffixForm}s that have
   * the `FORBIDDENWORD` flag will still be yielded.
   */
  withForbidden?: boolean
}

/** Class that facilitaties lookups for a spellchecker. */
export class Lookup {
  /** Spellchecker's affix data. */
  declare aff: Aff

  /** Spellchecker's dictionary data. */
  declare dic: Dic

  /**
   * @param aff - The affix data to use.
   * @param dic - The dictionary data to use.
   */
  constructor(aff: Aff, dic: Dic) {
    this.aff = aff
    this.dic = dic
  }

  /**
   * Checks if a word is spelled correctly.
   *
   * @param word - The word to check.
   * @param caps - If true, checking will be case sensitive. Defaults to true.
   * @param allowNoSuggest - If false, words which are in the dictionary,
   *   but are flagged with the `NOSUGGEST` flag (if provided), will not be
   *   considered correct. Defaults to true.
   */
  check(word: string, caps = true, allowNoSuggest = true): LookupResult {
    let forbidden = this.isForbidden(word)
    let warn = this.isWarn(word)

    if (forbidden) return { correct: false, forbidden, warn }

    if (this.aff.ICONV) word = this.aff.ICONV.match(word)

    if (this.aff.IGNORE) {
      for (const ch of this.aff.IGNORE) {
        word = word.replaceAll(ch, "")
      }
    }

    if (C.NUMBER_REGEX.test(word)) return { correct: true, forbidden, warn }

    for (const words of breakWord(this.aff, word)) {
      if (words.every(word => this.correct(word, { caps, allowNoSuggest }))) {
        return { correct: true, forbidden, warn }
      }
    }

    return { correct: false, forbidden, warn }
  }

  /**
   * Yields *correct* combinations of stems and affixes for a word,
   * specifically instances of {@link AffixForm} or {@link CompoundForm}. If
   * this function does actually yield a form, that means that it can be
   * considered as spelled correctly.
   *
   * @param word - The word to yield the forms of.
   * @see {@link LKC}
   */
  *forms(
    word: string,
    {
      caps = true,
      allowNoSuggest = true,
      affixForms = true,
      compoundForms = true
    }: LKC = {}
  ) {
    let captype: CapType, variants: string[]

    if (caps) {
      ;[captype, ...variants] = this.aff.casing.variants(word)
    } else {
      captype = this.aff.casing.guess(word)
      variants = [word]
    }

    const lkword = new LKWord(this.aff, this.dic, word, captype)

    for (const variant of variants) {
      const word = lkword.to(variant)

      if (affixForms) {
        for (const form of word.affixForms(allowNoSuggest)) {
          if (
            form.inDictionary &&
            captype === CapType.ALL &&
            includes(this.aff.KEEPCASE, form.flags) &&
            this.aff.isSharps(form.inDictionary.stem) &&
            this.aff.isSharps(lkword.word)
          ) {
            continue
          }
          yield form
        }
      }

      if (compoundForms) yield* word.compoundForms(allowNoSuggest)
    }
  }

  // -- UTILITY

  /**
   * Checks if a word is spelled correctly. Performs no processing on the
   * word, such as handling `aff.IGNORE` characters.
   *
   * @param word - The word to check.
   * @see {@link LKC}
   */
  correct(word: string, { caps, allowNoSuggest, affixForms, compoundForms }: LKC = {}) {
    return any(this.forms(word, { caps, allowNoSuggest, affixForms, compoundForms }))
  }

  /**
   * Yields the stems of a word. If no stems are returned, the word was incorrect.
   *
   * @param word - The word to yield the stems of.
   * @see {@link LKC}
   */
  *stems(word: string, { caps, allowNoSuggest, affixForms, compoundForms }: LKC = {}) {
    if (this.aff.ICONV) word = this.aff.ICONV.match(word)

    if (this.aff.IGNORE) {
      for (const ch of this.aff.IGNORE) {
        word = word.replaceAll(ch, "")
      }
    }

    const iter = this.forms(word, { caps, allowNoSuggest, affixForms, compoundForms })

    for (const form of iter) {
      if (Array.isArray(form)) yield* iterate(form).map(form => form.stem)
      else yield form.stem
    }
  }

  /**
   * Yields a list of a data maps associated with the homonyms of the given stem.
   *
   * @param stem - The stem to get the data of.
   * @param caps - If true, checking will be case sensitive. Defaults to true.
   */
  *data(stem: string, caps = true) {
    for (const homonym of this.dic.homonyms(stem, !caps)) {
      if (!homonym.data) continue
      yield homonym.data
    }
  }

  /**
   * Determines if a stem is marked with the `WARN` flag.
   *
   * @param stem - The stem to check.
   */
  isWarn(stem: string) {
    return this.dic.hasFlag(stem, this.aff.WARN, true)
  }

  /**
   * Determines if a stem is marked as forbidden, either through the
   * `FORBIDDENWORD` flag *or* the the combination of the stem having the
   * `WARN` flag and the `FORBIDWARN` directive being true.
   *
   * @param stem - The word to check.
   */
  isForbidden(stem: string) {
    return (
      this.dic.hasFlag(stem, this.aff.FORBIDDENWORD, true) ||
      (this.aff.FORBIDWARN && this.dic.hasFlag(stem, this.aff.WARN, true))
    )
  }
}
