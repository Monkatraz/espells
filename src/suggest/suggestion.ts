/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { SuggestionKind } from "../constants"

/** The object that the {@link Suggest} class uses internally for tracking suggestions. */
export class Suggestion {
  constructor(
    /** The actual suggested text. */
    public text: string,
    /** Describes what actually generated this suggestion. */
    public kind: SuggestionKind
  ) {}

  /**
   * Returns a new {@link Suggestion}, cloned from this current instance,
   * but with any properties given replaced.
   */
  replace(text = this.text, kind = this.kind) {
    return new Suggestion(text, kind)
  }
}

/**
 * Like the usual {@link Suggestion}, but instead stores a list of words
 * that represents the entire suggestion.
 */
export class MultiWordSuggestion {
  constructor(
    /** The list of words that represents this suggestion. */
    public words: string[],
    /** Describes what actually generated this suggestion. */
    public kind: SuggestionKind,
    /**
     * If true, this suggestion is allowed to be given to the user with
     * dashes joining the words together.
     */
    public allowDash = true
  ) {}

  /**
   * Converts this multi-word suggestion into a normal {@link Suggestion} by
   * joining the words list together.
   *
   * @param seperator - The separator to use. Defaults to a space.
   */
  stringify(seperator = " ") {
    return new Suggestion(this.words.join(seperator), this.kind)
  }
}
