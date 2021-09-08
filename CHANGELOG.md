# Changelog

## 0.2.0

- Precalculate the prefixes and suffixes that apply to a word to improve the performance of ngram suggestions.

- Use an enum for suggestion kinds (`SuggestionKind`, in `constants.ts` now), rather than strings.

- Fix bug with casing variants & corrections not including the original word as a variant.

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

- Fix escaped slash (`\/`) parsing in `.dic` files.

- Fixed bug with compound rules allowing incorrect compounds.
