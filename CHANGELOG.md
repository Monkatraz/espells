# Changelog

## 0.3.1

- Fixed long flags not playing nice with the `)` character.

## 0.3.0

- Espells now passes all lookup-based tests.

- Optimizations to the decomposition, affix compatibility functions.

- Moved `LKFlags` class to its own file.

- Moved affix form validation functions to `forms.ts`.

- Added utility function for `AFF.IGNORE` transformations.

- Added `dictionary-fr` French dictionary as a test fixture.

- Added limits to individual permutation types (e.g. `MAP` directives) to prevent them from stalling the spellchecker during suggestion discovery.

- Fixed default `BREAK` directive setting being misconfigured.

- Fixed nasty bug with Turkic casing.

- Fixed some bugs with affix parsing.

- Fixed incorrect quantifier bug with compound rule parsing.

- Fixed `CHECKCOMPOUNDDUP` being misspelled and therefore not working.

- Fixed how `isBadCompound` parsed through a `CompoundForm`.

- Fixed how `CHECKCOMPOUNDTRIPLE` works.

- Fixed `LKWord` `at` method for negative indices.

- Fixed how `CompoundPattern` `match` worked.

- Fixed compound flags behaving oddly.

- Fixed how affixes were checked for compatibility with a required set of flags.

- Fixed `LONG` flags in compound rules.

- Fixed `.dic` word splitting regex not respecting whitespace correctly.

## 0.2.0

- Precalculate the prefixes and suffixes that apply to a word to improve the performance of ngram suggestions.

- Use an enum for suggestion kinds (`SuggestionKind`, in `constants.ts` now), rather than strings.

- Fixed bug with casing variants & corrections not including the original word as a variant.

- Add Spylls' test suite.

- Fixed a bunch of bugs caused by faulty flag parsing.

- Fixed an empty "required flags" set not being treated as "any flag is fine", rather than "no flags are fine".

- Fixed bug with compound words not having their partial end-position-sub-words marked as at the end of the compound.

- Fixed a bug with Trie traversal that caused fully stripped affixes not to work.

- Fixed a bug with `hasFlag` dictionary method where some checks would fail if `all` was `true`.

- Fixed a bug with affixes decomposition with suffixes.

- Fixed how words are broken apart and checked.

- Fixed opening parenthesis of compound rules not being included in the rule's regex.

- Moved most of the affix parsing and affix form generation into `LKWord` class to improve isolation

- Fixed `IGNORE` from not working entirely.

- Fixed escaped slash (`\/`) parsing in `.dic` files.

- Fixed bug with compound rules allowing incorrect compounds.
