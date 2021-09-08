import type { Aff, Flags } from "../aff"
import type { CompoundRule } from "../aff/compound-rule"
import { CapType, CompoundPos } from "../constants"
import { Dic, Word } from "../dic"
import { lowercase } from "../util"
import { decompose } from "./decompose"
import { AffixForm, CompoundForm, isBadCompound } from "./forms"
import { LKFlags } from "./lk-flags"

/**
 * A word (a string) wrapped with metadata. Can be iterated, and will
 * coerce itself to a string.
 */
export class LKWord {
  constructor(
    /** The {@link Aff} data the word derives metadata from. */
    public aff: Aff,
    /** The {@link dic} data the word derives forms and stems from. */
    public dic: Dic,
    /** The word itself. */
    public word: string,
    /** The capitalization type of the word. */
    public type: CapType,
    /** The position of the word in a compound, if any. */
    public pos?: CompoundPos
  ) {}

  /**
   * Reuses this instance's metadata on a new word.
   *
   * @param word - The new word string to use.
   */
  to(word: string, captype = this.type) {
    return new LKWord(this.aff, this.dic, word, captype, this.pos)
  }

  /**
   * Reuses this instance, but changes the compound position.
   *
   * @param pos - The new compound position.
   */
  shift(pos: CompoundPos) {
    return new LKWord(this.aff, this.dic, this.word, this.type, pos)
  }

  /**
   * Returns a new {@link LKWord} from a section of this word.
   *
   * @param from - The starting index of the section. Can be negative.
   * @param to - The ending index of the section.
   */
  slice(from?: number, to?: number) {
    return this.to(this.word.slice(from, to))
  }

  /**
   * Executes an ordinary text replacement operation on this word and
   * returns a new instance from the result.
   *
   * @param pat - The object that will search for matches in the word.
   * @param repl - The replacement string for the found match.
   */
  replace(pat: { [Symbol.replace](s: string, r: string): string }, repl = "") {
    return this.to(this.word.replace(pat, repl))
  }

  /**
   * Executes an ordinary text replacement operation on this word and
   * returns a new instance from the result. Replaces all matches, rather
   * than just the first one found.
   *
   * @param pat - The global `RegExp` or string to match with.
   * @param repl - The replacement string for the found match.
   */
  replaceAll(pat: string | RegExp, repl = "") {
    return this.to(this.word.replaceAll(pat, repl))
  }

  /**
   * Adds (concatenates) a string (or another {@link LKWord}) to this word
   * and returns a new instance from the result.
   *
   * @param str - The string or {@link LKWord} to add.
   */
  add(str: string | LKWord) {
    if (str instanceof LKWord) str = str.word
    return this.to(this.word + str)
  }

  /**
   * Gets the character at the specified index. Accepts negative numbers.
   *
   * @param n - The index of the desired character. Can be negative.
   */
  at(n: number) {
    if (n < 0) return this.word[this.word.length + n]
    return this.word[n]
  }

  /** The length of the word. */
  get length() {
    return this.word.length
  }

  [Symbol.toStringTag]() {
    return this.word
  }

  *[Symbol.iterator]() {
    yield* this.word
  }

  [Symbol.toPrimitive]() {
    return this.word
  }

  // -- AFFIX FORMS

  /**
   * Yields the allowed {@link AffixForm}s for this word, as in all ways the
   * word can be split into stems and affixes, with all stems and affixes
   * being mutually compatible.
   */
  *affixForms(allowNoSuggest = true, withForbidden = false, flags = new LKFlags()) {
    for (const form of decompose(this.aff, this, flags)) {
      let found = false

      const homonyms = this.dic.homonyms(form.stem)

      if (homonyms.size) {
        if (!withForbidden && this.hasForbidden(form, homonyms)) return
        found = yield* this.candidates(form, allowNoSuggest, form.stem, homonyms)
      }

      if (
        this.pos === CompoundPos.BEGIN &&
        this.aff.FORCEUCASE &&
        this.type === CapType.INIT
      ) {
        found = yield* this.candidates(form, allowNoSuggest, lowercase(form.stem))
      }

      if (found || this.pos !== undefined || this.type !== CapType.ALL) {
        continue
      }

      if (this.aff.casing.guess(this.word) === CapType.NO) {
        yield* this.candidates(form, allowNoSuggest)
      }
    }
  }

  private hasForbidden(form: AffixForm, words: Set<Word>) {
    if (!this.aff.FORBIDDENWORD) return false
    if (this.pos === undefined && !form.hasAffixes) return false
    for (const word of words) {
      if (word.has(this.aff.FORBIDDENWORD)) return true
    }
    return false
  }

  /**
   * Takes an {@link AffixForm} and yields all of the allowed forms of the
   * entire word form, taking into account {@link Aff} directives and other
   * edge cases.
   */
  private *candidates(
    form: AffixForm,
    allowNoSuggest = true,
    stem = form.stem,
    homonyms?: Set<Word>
  ) {
    let found = false
    for (const homonym of homonyms ?? this.dic.homonyms(stem, true)) {
      const candidate = form.replace({ inDictionary: homonym })
      if (candidate.valid(this, allowNoSuggest)) {
        found = true
        yield candidate
      }
    }
    return found
  }

  // -- COMPOUND FORMS

  /**
   * Produces all valid {@link CompoundForm}s for a word. Really, the "hard
   * work" done by this function is performed by the
   * {@link Lookup.compoundsByFlags} and the {@link Lookup.compoundsByRules} methods.
   */
  *compoundForms(allowNoSuggest = true) {
    // don't even try to decompose a forbidden word
    // TODO: this is incredibly slow, remove this
    if (this.aff.FORBIDDENWORD) {
      for (const candidate of this.affixForms(true, true)) {
        if (candidate.flags.has(this.aff.FORBIDDENWORD)) return
      }
    }

    if (this.aff.COMPOUNDBEGIN || this.aff.COMPOUNDFLAG) {
      for (const compound of this.compoundsByFlags(allowNoSuggest)) {
        if (!isBadCompound(this, compound, this.type)) {
          yield compound
        }
      }
    }

    if (this.aff.COMPOUNDRULE.size) {
      for (const compound of this.compoundsByRules()) {
        if (!isBadCompound(this, compound, this.type)) {
          yield compound
        }
      }
    }
  }
  /**
   * Takes this word and yields the {@link CompoundForm}s of it using the
   * `COMPOUNDFLAG`/`COMPOUNDBEGIN|MIDDLE|END` marker system.
   */
  *compoundsByFlags(allowNoSuggest = true, depth = 0): Iterable<CompoundForm> {
    const aff = this.aff

    const forbiddenFlags: Flags = new Set<string>()
    const permitFlags: Flags = new Set<string>()

    if (aff.COMPOUNDFORBIDFLAG) forbiddenFlags.add(aff.COMPOUNDFORBIDFLAG)
    if (aff.COMPOUNDPERMITFLAG) permitFlags.add(aff.COMPOUNDPERMITFLAG)

    if (depth) {
      const forms = this.shift(CompoundPos.END).affixForms(
        allowNoSuggest,
        false,
        new LKFlags({ prefix: permitFlags, forbidden: forbiddenFlags })
      )

      for (const form of forms) {
        yield [form]
      }
    }

    if (this.length < aff.COMPOUNDMIN * 2) return
    if (aff.COMPOUNDWORDMAX && depth > aff.COMPOUNDWORDMAX) return

    const compoundpos = depth ? CompoundPos.MIDDLE : CompoundPos.BEGIN
    const prefixFlags: Flags = compoundpos === CompoundPos.BEGIN ? new Set() : permitFlags

    for (let pos = aff.COMPOUNDMIN; pos < this.length - aff.COMPOUNDMIN + 1; pos++) {
      const beg = this.slice(0, pos)
      beg.pos = compoundpos

      const rest = this.slice(pos)
      rest.pos = compoundpos

      const flags = LKFlags.from(prefixFlags, permitFlags, forbiddenFlags)

      for (const form of beg.affixForms(allowNoSuggest, false, flags)) {
        for (const partial of rest.compoundsByFlags(allowNoSuggest, depth + 1)) {
          yield [form, ...partial]
        }
      }

      if (aff.SIMPLIFIEDTRIPLE && beg.at(-1) === rest.at(0)) {
        const forms = beg.add(beg.at(-1)).affixForms(allowNoSuggest, false, flags)
        for (const form of forms) {
          for (const partial of rest.compoundsByFlags(allowNoSuggest, depth + 1)) {
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
  *compoundsByRules(prev: Word[] = [], rules?: CompoundRule[]): Iterable<CompoundForm> {
    const aff = this.aff

    if (!rules) rules = [...this.aff.COMPOUNDRULE]

    if (prev.length) {
      for (const homonym of this.dic.homonyms(this.word)) {
        const parts = [...prev, homonym]
        const flagSets = Word.flagSets(parts)
        if (rules.some(rule => rule.match(flagSets))) {
          yield [new AffixForm(this)]
        }
      }
    }

    if (this.length < aff.COMPOUNDMIN * 2) return
    if (aff.COMPOUNDWORDMAX && prev.length >= aff.COMPOUNDWORDMAX) return

    for (let pos = aff.COMPOUNDMIN; pos < this.length - aff.COMPOUNDMIN + 1; pos++) {
      const beg = this.slice(0, pos)

      for (const homonynm of this.dic.homonyms(beg.word)) {
        const parts = [...prev, homonynm]
        const flagSets = Word.flagSets(parts)
        const compoundRules = rules.filter(rule => rule.match(flagSets, true))
        if (compoundRules.length) {
          for (const rest of this.slice(pos).compoundsByRules(parts, compoundRules)) {
            yield [new AffixForm(beg), ...rest]
          }
        }
      }
    }
  }
}
