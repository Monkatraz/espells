import { CapType, CompoundPos } from "../constants"
import type { Word } from "../dic"
import { includes, lowercase } from "../util"
import { decompose } from "./decompose"
import type { AffixForm } from "./forms"
import { LKFlags } from "./lk-flags"
import type { LKWord } from "./lk-word"

/**
 * Yields the allowed {@link AffixForm}s for this word, as in all ways the
 * word can be split into stems and affixes, with all stems and affixes
 * being mutually compatible.
 */
export function* affixForms(
  word: LKWord,
  allowNoSuggest = true,
  withForbidden = false,
  flags = new LKFlags()
) {
  const aff = word.aff
  const dic = word.dic

  for (const form of decompose(word, flags)) {
    let found = false

    const homonyms = dic.homonyms(form.stem)

    if (homonyms.size) {
      if (!withForbidden && hasForbidden(word, form, homonyms)) return
      found = yield* candidates(word, form, allowNoSuggest, homonyms)
    }

    if (word.pos === CompoundPos.BEGIN && aff.FORCEUCASE && word.type === CapType.INIT) {
      const homonyms = dic.homonyms(lowercase(form.stem), true)
      found = yield* candidates(word, form, allowNoSuggest, homonyms)
    }

    if (found || word.pos !== undefined || word.type !== CapType.ALL) {
      continue
    }

    if (aff.casing.guess(word.word) === CapType.NO) {
      yield* candidates(word, form, allowNoSuggest, dic.homonyms(form.stem, true))
    }
  }
}

function hasForbidden(lkword: LKWord, form: AffixForm, words: Set<Word>) {
  if (!lkword.aff.FORBIDDENWORD) return false
  if (lkword.pos === undefined && !form.hasAffixes) return false
  for (const word of words) {
    if (word.has(lkword.aff.FORBIDDENWORD)) return true
  }
  return false
}

/**
 * Takes an {@link AffixForm} and yields all of the allowed forms of the
 * entire word form, taking into account {@link Aff} directives and other edge cases.
 */
function* candidates(
  word: LKWord,
  form: AffixForm,
  allowNoSuggest = true,
  homonyms: Set<Word>
) {
  let found = false
  for (const homonym of homonyms) {
    const candidate = form.replace({ inDictionary: homonym })
    if (validForm(candidate, word, allowNoSuggest)) {
      found = true
      yield candidate
    }
  }
  return found
}

/**
 * Determines if this form is valid for the {@link LKWord} specified.
 *
 * @param word - The word to validate against.
 * @param allowNoSuggest - If false, words which are in the dictionary, but
 *   are flagged with the `NOSUGGEST` flag (if provided), will not be
 *   considered correct. Defaults to true.
 */
export function validForm(form: AffixForm, word: LKWord, allowNoSuggest = true) {
  if (!form.inDictionary) return false

  const aff = word.aff

  const rootFlags = form.inDictionary.flags ?? new Set()
  const allFlags = form.flags

  if (!allowNoSuggest && includes(aff.NOSUGGEST, rootFlags)) return false

  if (
    word.type !== form.inDictionary.capType &&
    includes(aff.KEEPCASE, rootFlags) &&
    !aff.isSharps(form.inDictionary.stem)
  ) {
    return false
  }

  if (aff.NEEDAFFIX) {
    if (form.has(aff.NEEDAFFIX) || rootFlags.has(aff.NEEDAFFIX)) return false
  }

  if (form.prefix && !allFlags.has(form.prefix.flag)) return false
  if (form.suffix && !allFlags.has(form.suffix.flag)) return false

  if (aff.CIRCUMFIX) {
    const suffixHas = Boolean(form.suffix?.has(aff.CIRCUMFIX))
    const prefixHas = Boolean(form.prefix?.has(aff.CIRCUMFIX))
    if (suffixHas !== prefixHas) return false
  }

  if (word.pos === undefined) {
    if (!includes(aff.ONLYINCOMPOUND, allFlags)) return true
    return false
  }

  if (includes(aff.COMPOUNDFLAG, allFlags)) return true

  // prettier-ignore
  switch(word.pos) {
        case CompoundPos.BEGIN:  return includes(aff.COMPOUNDBEGIN,  allFlags)
        case CompoundPos.MIDDLE: return includes(aff.COMPOUNDMIDDLE, allFlags)
        case CompoundPos.END:    return includes(aff.COMPOUNDEND,    allFlags)
      }
}
