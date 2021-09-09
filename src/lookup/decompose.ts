/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Aff } from "../aff"
import { CompoundPos } from "../constants"
import { concat, reverse } from "../util"
import { AffixForm } from "./forms"
import type { LKFlags } from "./lk-flags"
import type { LKWord } from "./lk-word"

export const enum AffixType {
  PREFIX,
  SUFFIX
}

/**
 * Yields permutations of a word split up (with whitespace) using the
 * `BREAK` rules given by the spellchecker's {@link Aff} data.
 *
 * @param aff - The affix data to use.
 * @param text - The word/text to split.
 * @param depth - The current depth of the check. Used by this function
 *   when calling itself recursively. There isn't any need to set it yourself.
 */
export function* breakWord(aff: Aff, text: string, depth = 0): Iterable<string[]> {
  if (depth > 10) return
  yield [text].filter(Boolean)
  for (const pattern of aff.BREAK) {
    for (const m of text.matchAll(pattern)) {
      const start = text.slice(0, m.index!)
      const rest = text.slice(m.index! + m[0].length)
      for (const breaking of breakWord(aff, rest, depth + 1)) {
        yield [start, ...breaking].filter(Boolean)
      }
    }
  }
}

/**
 * Takes in a {@link LKWord} and yields a progressive decomposition of the
 * affixes and stems that can be found in the word.
 *
 * @param word - The word to decompose.
 * @param flags - The {@link LKFlags} that restrain the possible forms of the word.
 */
export function* decompose(word: LKWord, flags: LKFlags) {
  yield new AffixForm(word)

  const suffixAllowed =
    word.pos === undefined || word.pos === CompoundPos.END || flags.suffix.size

  const prefixAllowed =
    word.pos === undefined || word.pos === CompoundPos.BEGIN || flags.prefix.size

  if (suffixAllowed) {
    yield* desuffix(word.aff, word.word, flags)
  }

  if (prefixAllowed) {
    for (const form of deprefix(word.aff, word.word, flags)) {
      yield form
      if (suffixAllowed && form.prefix?.crossproduct) {
        for (const form2 of desuffix(word.aff, form.stem, flags, true)) {
          yield form2.replace({ text: form.text, prefix: form.prefix })
        }
      }
    }
  }
}

/**
 * Gets the affixes for a word, either yielding {@link Prefix}es or
 * {@link Suffix}es depending on the given {@link AffixType}.
 *
 * @param aff - The {@link Aff} data to use, specifically the trie indexes.
 * @param type - The {@link AffixType} being searched for, either
 *   {@link AffixType.PREFIX} or {@link AffixType.SUFFIX}.
 * @param word - The word to get the affixes of.
 * @param flags - The flags used for filtering what is yielded.
 * @param crossproduct - If true, enables crossproduct checking.
 */
function* affixes(
  aff: Aff,
  type: AffixType,
  word: string,
  flags: LKFlags,
  crossproduct?: boolean
) {
  const isSuffix = type === AffixType.SUFFIX
  const segments = isSuffix
    ? aff.suffixesIndex.segments(reverse(word))
    : aff.prefixesIndex.segments(word)

  if (segments) {
    const required = isSuffix ? flags.suffix : flags.prefix

    for (const segment of segments) {
      for (const affix of segment) {
        if (isSuffix && !(!crossproduct || affix.crossproduct)) continue
        if (!affix.on(word)) continue
        if (!affix.compatible(required, flags.forbidden)) continue
        yield affix
      }
    }
  }
}

/**
 * Yields progressively more decomposed transformations (more suffixes
 * removed) of the given word as {@link AffixForm}s.
 *
 * @param aff - The {@link Aff} data to use.
 * @param word - The word to decompose the suffixes out of.
 * @param flags - The flags used to filter valid {@link AffixForm}s.
 * @param crossproduct - If true, crossproduct checking will be enabled.
 * @param nested - Internal argument for handling recursion.
 */
function* desuffix(
  aff: Aff,
  word: string,
  flags: LKFlags,
  crossproduct?: boolean,
  nested?: boolean
): Iterable<AffixForm> {
  for (const suffix of affixes(aff, AffixType.SUFFIX, word, flags, crossproduct)) {
    const stem = suffix.apply(word)

    yield new AffixForm(word, stem, { suffix })

    if (!nested) {
      const newFlags = flags.replace({ suffix: concat(suffix.flags, flags.suffix) })
      for (const form2 of desuffix(aff, stem, newFlags, crossproduct, true)) {
        yield form2.replace({ text: word, suffix2: suffix })
      }
    }
  }
}

/**
 * Yields progressively more decomposed transformations (more prefixes
 * removed) of the given word as {@link AffixForm}s.
 *
 * @param aff - The {@link Aff} data to use.
 * @param word - The word to decompose the prefixes out of.
 * @param flags - The flags used to filter valid {@link AffixForm}s.
 * @param nested - Internal argument for handling recursion.
 */
function* deprefix(
  aff: Aff,
  word: string,
  flags: LKFlags,
  nested?: boolean
): Iterable<AffixForm> {
  for (const prefix of affixes(aff, AffixType.PREFIX, word, flags)) {
    const stem = prefix.apply(word)

    yield new AffixForm(word, stem, { prefix })

    if (!nested && aff.COMPLEXPREFIXES) {
      const newFlags = flags.replace({ prefix: concat(prefix.flags, flags.prefix) })
      for (const form2 of deprefix(aff, stem, newFlags, true)) {
        yield form2.replace({ text: word, prefix2: prefix })
      }
    }
  }
}
