import { iterate } from "iterare"
import type { Aff } from "../aff"
import { CapType, CONSTANTS as C, GOOD_EDITS, SuggestionKind } from "../constants"
import type { Dic } from "../dic"
import type { Word } from "../dic/word"
import type { Lookup } from "../lookup"
import {
  badchar,
  badcharkey,
  doubletwochars,
  extrachar,
  forgotchar,
  longswapchar,
  mapchars,
  movechar,
  replchars,
  swapchar,
  twowords
} from "../permutations"
import { intersect, lowercase, uppercase } from "../util"
import { NgramSuggestionBuilder } from "./ngram"
import { PhonetSuggestionBuilder } from "./phonet"
import { MultiWordSuggestion, Suggestion } from "./suggestion"

/**
 * Represents a {@link Suggest} function that "handles" potential
 * suggestions. Returns a new, transformed suggestion if the potential
 * suggestion was valid, otherwise returning nothing.
 */
type Handler = (
  suggestion: Suggestion,
  checkInclusion?: boolean
) => Suggestion | undefined

export class Suggest {
  /** {@link Aff} data used. */
  private declare aff: Aff

  /** {@link Dic} data used. */
  private declare dic: Dic

  /** {@link Lookup} instance used filtering and verifying suggestions. */
  private declare lookup: Lookup

  /**
   * A set of {@link Word} instances that have been filtered from the
   * {@link Dic} data. Any words that are marked with flags that make said
   * word unsuitable for being a standalone word are filtered out.
   */
  private declare ngramWords: Set<Word>

  /** If true, suggestions consisting of multiple words split with dashes are allowed. */
  private declare dashes: boolean

  /**
   * @param aff - {@link Aff} data to use.
   * @param dic - {@link Dic} data to use.
   * @param lookup - {@link Lookup} instance to use for filtering and
   *   verifying suggestions.
   */
  constructor(aff: Aff, dic: Dic, lookup: Lookup) {
    this.aff = aff
    this.dic = dic
    this.lookup = lookup

    const badFlags = iterate([aff.FORBIDDENWORD, aff.NOSUGGEST, aff.ONLYINCOMPOUND])
      .filter(flag => Boolean(flag))
      .toSet()

    this.ngramWords = iterate(dic.words)
      .filter(word => (!word.flags ? true : intersect(word.flags, badFlags).size === 0))
      .toSet()

    // TODO: fix this - this is dumb but this is legit how Hunspell does it
    this.dashes = aff.TRY.includes("-") || aff.TRY.includes("a")
  }

  /**
   * Yields {@link Suggestion} instances for the given word, even if it is
   * spelled correctly.
   *
   * @param word - The word to get the suggestions for.
   */
  *suggestions(word: string): Iterable<Suggestion> {
    const handled = new Set<string>()

    const [captype, ...variants] = this.aff.casing.corrections(word)

    const handle: Handler = (suggestion: Suggestion, checkInclusion = false) =>
      this.handle(word, captype, handled, suggestion, checkInclusion)

    if (this.aff.FORCEUCASE && captype === CapType.NO) {
      for (const capitalized of this.aff.casing.capitalize(word)) {
        if (this.correct(capitalized)) {
          const suggestion = handle(
            new Suggestion(capitalized, SuggestionKind.FORCEUCASE)
          )
          if (suggestion) yield suggestion
          return
        }
      }
    }

    let goodEditsFound = false

    for (let idx = 0; idx < variants.length; idx++) {
      const variant = variants[idx]

      if (idx > 0 && this.correct(variant)) {
        const suggestion = handle(new Suggestion(variant, SuggestionKind.CASE))
        if (suggestion) yield suggestion
      }

      let noCompound = false

      for (const suggestion of this.edits(variant, handle, C.MAX_SUGGESTIONS)) {
        yield suggestion

        goodEditsFound ||= GOOD_EDITS.includes(suggestion.kind)

        // prettier-ignore
        switch(suggestion.kind) {
          case SuggestionKind.UPPERCASE:
          case SuggestionKind.REPLCHARS:
          case SuggestionKind.MAPCHARS: {
            noCompound = true
            break
          }
          case SuggestionKind.SPACEWORD: return
        }
      }

      if (!noCompound) {
        for (const suggestion of this.edits(word, handle, this.aff.MAXCPDSUGS, true)) {
          yield suggestion
          goodEditsFound ||= GOOD_EDITS.includes(suggestion.kind)
        }
      }

      if (goodEditsFound) return

      if (word.includes("-") && !iterate(handled).some(word => word.includes("-"))) {
        const chunks = word.split("-")

        for (let idx = 0; idx < chunks.length; idx++) {
          const chunk = chunks[idx]
          if (!this.correct(chunk)) {
            for (const suggestion of this.suggestions(chunk)) {
              const candidate = [
                ...chunks.slice(0, idx),
                suggestion.text,
                ...chunks.slice(idx + 1)
              ].join("-")
              if (this.lookup.check(candidate)) {
                yield new Suggestion(candidate, SuggestionKind.DASHES)
              }
            }
          }
        }
      }

      if (this.aff.MAXNGRAMSUGS || this.aff.PHONE) {
        const ngram = this.aff.MAXNGRAMSUGS ? this.ngramBuilder(word, handled) : null
        const phonet = this.aff.PHONE ? this.phonetBuilder(word) : null

        for (const word of this.ngramWords) {
          if (ngram) ngram.step(word)
          if (phonet) phonet.step(word)
        }

        if (ngram) {
          yield* iterate(ngram.finish())
            .take(this.aff.MAXNGRAMSUGS)
            .map(
              suggestion =>
                handle(new Suggestion(suggestion, SuggestionKind.NGRAM), true)!
            )
            .filter(suggestion => suggestion !== undefined)
        }

        if (phonet) {
          yield* iterate(phonet.finish())
            .take(C.MAX_PHONET_SUGGESTIONS)
            .map(suggestion => handle(new Suggestion(suggestion, SuggestionKind.PHONET))!)
            .filter(suggestion => suggestion !== undefined)
        }
      }
    }
  }

  /**
   * Yields various correct {@link Suggestion} instances that were found by
   * transforming the given word using various simple "edit" functions.
   * e.g. this may involve breaking the word apart at various points,
   * shifting characters around, removing characters, etc.
   *
   * @param word - The word to apply the "edits" transformations to.
   * @param handle - The {@link Handler} instance to yield every {@link Suggestion} to.
   * @param limit - The maximum number of correct {@link Suggestion}
   *   instances to yield.
   * @param compounds - If provided, false will yield only suggestions
   *   found from {@link AffixForm}s, and true will yield only suggestions
   *   found from {@link CompoundForm}s.
   */
  private *edits(word: string, handle: Handler, limit: number, compounds?: boolean) {
    yield* iterate(this.filter(this.permutations(word), compounds))
      .map(suggestion => handle(suggestion)!)
      .filter(suggestion => suggestion !== undefined)
      .take(limit)
  }

  /**
   * Filters {@link Suggestion} and {@link MultiWordSuggestion} instances.
   * This process involves splitting out the {@link MultiWordSuggestion}
   * instances into a few forms, and making sure that every
   * {@link Suggestion} that will be yielded is correct.
   *
   * @param suggestions - The iterator that should have its resultant
   *   suggestions filtered.
   * @param compounds - If provided, false will yield only suggestions
   *   found from {@link AffixForm}s, and true will yield only suggestions
   *   found from {@link CompoundForm}s.
   */
  private *filter(
    suggestions: Iterable<Suggestion | MultiWordSuggestion>,
    compounds?: boolean
  ) {
    for (const suggestion of suggestions) {
      if (suggestion instanceof MultiWordSuggestion) {
        if (suggestion.words.every(word => this.correct(word, compounds))) {
          yield suggestion.stringify()
          if (suggestion.allowDash) yield suggestion.stringify("-")
        }
      } else if (this.correct(suggestion.text, compounds)) {
        yield suggestion
      }
    }
  }

  // -- MISC.

  /**
   * Base function that a {@link Handler} can be made from.
   *
   * @param word - The word to compare the given {@link Suggestion} to.
   * @param captype - The {@link CapType} of the word.
   * @param handled - The set of already handled words and stems.
   * @param suggestion - The {@link Suggestion} to handle.
   * @param checkInclusion - If true, the {@link Suggestion} text will be
   *   checked for if it can be found in its entirety inside of any the
   *   previously handled suggestions. Not just in the set, but if it can
   *   be found even as a substring. Defaults to false.
   */
  private handle(
    word: string,
    captype: CapType,
    handled: Set<string>,
    suggestion: Suggestion,
    checkInclusion = false
  ) {
    let text = suggestion.text

    if (!this.dic.hasFlag(text, this.aff.KEEPCASE) || this.aff.isSharps(text)) {
      text = this.aff.casing.coerce(text, captype)
      // revert if forbidden
      if (text !== suggestion.text && this.lookup.isForbidden(text)) {
        text = suggestion.text
      }

      if (captype === CapType.HUH || captype === CapType.HUHINIT) {
        const pos = text.indexOf(" ")
        if (pos !== -1) {
          if (text[pos + 1] !== word[pos] && uppercase(text[pos + 1]) === word[pos]) {
            text = text.slice(0, pos + 1) + word[pos] + word.slice(pos + 2)
          }
        }
      }
    }

    if (this.lookup.isForbidden(text)) return

    if (this.aff.OCONV) text = this.aff.OCONV.match(text)

    if (handled.has(text)) return

    if (
      checkInclusion &&
      iterate(handled).some(prev => lowercase(text).includes(lowercase(prev)))
    ) {
      return
    }

    handled.add(text)

    return suggestion.replace(text)
  }

  /**
   * Yields every permutation (as {@link Suggestion} or
   * {@link MultiWordSuggestion} instances) of a word processed through
   * *many* different simple transformation functions.
   *
   * @param word - The word to yield the permutations of.
   */
  private *permutations(word: string): Iterable<Suggestion | MultiWordSuggestion> {
    yield new Suggestion(this.aff.casing.upper(word), SuggestionKind.UPPERCASE)

    for (const suggestion of replchars(word, this.aff.REP)) {
      if (Array.isArray(suggestion)) {
        yield new Suggestion(suggestion.join(" "), SuggestionKind.REPLCHARS)
        yield new MultiWordSuggestion(suggestion, SuggestionKind.REPLCHARS, false)
      } else {
        yield new Suggestion(suggestion, SuggestionKind.REPLCHARS)
      }
    }

    for (const words of twowords(word)) {
      yield new Suggestion(words.join(" "), SuggestionKind.SPACEWORD)
      if (this.dashes) yield new Suggestion(words.join("-"), SuggestionKind.SPACEWORD)
    }

    // prettier-ignore
    {
      yield* this.pmtFrom(mapchars(word, this.aff.MAP),   SuggestionKind.MAPCHARS)
      yield* this.pmtFrom(swapchar(word),                 SuggestionKind.SWAPCHAR)
      yield* this.pmtFrom(longswapchar(word),             SuggestionKind.LONGSWAPCHAR)
      yield* this.pmtFrom(badcharkey(word, this.aff.KEY), SuggestionKind.BADCHARKEY)
      yield* this.pmtFrom(extrachar(word),                SuggestionKind.EXTRACHAR)
      yield* this.pmtFrom(forgotchar(word, this.aff.TRY), SuggestionKind.FORGOTCHAR)
      yield* this.pmtFrom(movechar(word),                 SuggestionKind.MOVECHAR)
      yield* this.pmtFrom(badchar(word, this.aff.TRY),    SuggestionKind.BADCHAR)
      yield* this.pmtFrom(doubletwochars(word),           SuggestionKind.DOUBLETWOCHARS)
    }

    if (!this.aff.NOSPLITSUGS) {
      for (const suggestionPair of twowords(word)) {
        yield new MultiWordSuggestion(
          suggestionPair,
          SuggestionKind.TWOWORDS,
          this.dashes
        )
      }
    }
  }

  // -- UTILITY

  /**
   * Helper for checking if a word is correct using some preconfigured
   * settings specific to the {@link Suggest} class.
   */
  private correct(word: string, compounds?: boolean) {
    return this.lookup.correct(word, {
      caps: false,
      allowNoSuggest: false,
      affixForms: !compounds,
      compoundForms: compounds
    })
  }

  /**
   * Helper for yielding {@link Suggestion} instances from a iterator that
   * yields strings.
   */
  private *pmtFrom(iter: Iterable<string>, kind: SuggestionKind) {
    for (const suggestion of iter) {
      yield new Suggestion(suggestion, kind)
    }
  }

  /** Returns a preconfigured {@link NgramSuggestionBuilder}. */
  private ngramBuilder(word: string, handled: Set<string>) {
    return new NgramSuggestionBuilder(
      lowercase(word),
      iterate(handled).map(lowercase).toSet(),
      this.aff.MAXDIFF,
      this.aff.ONLYMAXDIFF,
      Boolean(this.aff.PHONE)
    )
  }

  /** Yields a preconfigured {@link PhonetSuggestionBuilder}. */
  private phonetBuilder(word: string) {
    return new PhonetSuggestionBuilder(word, this.aff.PHONE!)
  }
}
