# Changelog

## 0.2.0

- Precalculate the prefixes and suffixes that apply to a word to improve the performance of ngram suggestions.

- Use an enum for suggestion kinds (`SuggestionKind`, in `constants.ts` now), rather than strings.
