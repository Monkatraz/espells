# Espells: Hunspell ported to Python ported to JavaScript

Pure JS/TS spellchecker, using Hunspell dictionaries. Direct port of the [Spylls](https://github.com/zverok/spylls) library. Without zverok's (the author of Spylls) work, this library couldn't exist.

Espells makes no use of features that would prevent it from running within Node, a browser, or even a web worker. Effectively, it's just a pure spellchecking library and it's up to you to connect it to whatever interface you want.

Espells was created as part of my work on [Wikijump](https://github.com/scpwiki/wikijump/).

### Why?

Two main reasons:

1. You can't access the browser's spellchecking functionality in JS.
2. There wasn't a fully featured spellchecker for clientside JS.

To elaborate on that second point: libraries using Hunspell, or are compatible with Hunspell dictionaries, do exist. However, they're either incapable of handling many dictionaries, aren't fully featured, can only run in Node, or bastardize Hunspell to run in WASM, with mixed results. Espells doesn't have those problems.

### Features

Espells supports _everything_ that Spylls support, which supports _almost_ everything that Hunspell does. It reads the `.dic` and `.aff` formats that Hunspell expects. It can handle very complex languages, like the usual Italian `.aff`, without crashing or using excessive memory.

## Installation

```
npm install espells
```

You can get dictionaries very easily from NPM as well, see [here for that](https://github.com/wooorm/dictionaries).

## Usage

Usage of Espells is incredibly simple. It's primary interface is the `Espells` class exported by the module, which can be instantiated like so:

```ts
import { Espells } from "espells"
// the .aff and .dic should be given to Espells as a string or Uint8Array
// this special import just represents getting this data
import { aff, dic, dic2 } from "your-dictionary"

const spellchecker = new Espells({ aff, dic })

// alternatively, you can use a special async method to instantiate from URLs
const urlSpellchecker = await Espells.fromURL({
  aff: "someurl.aff",
  dic: "someurl.dic"
})

// finally, Espells supports loading multiple dictionaries at once
// this can be done with either the fromURL method or the normal constructor
const multipleSpellchecker = new Espells({ aff, dic: [dic, dic2] })
```

Espells is ready to use immediately. You can spellcheck a word like so:

```ts
const { correct, forbidden, warn } = spellchecker.lookup("word")
```

The `forbidden` and `warn` properties are special properties a "correctly spelled" word may have in Hunspell. Forbidden words are usually correct syntax wise, but aren't really considered real words, like "decreated". A word with `warn: true` is _technically_ a correctly spelled word, but usually usage of that specific word is a mistake.

Getting suggestions is simple as well:

```ts
// an array of strings
const suggestions = spellchecker.suggest("wodr")
```

There are quite a few other methods made available, specifically: `addDictionary`, `add`, `remove`, `stems`, and `data`. These are fully documented in detailed `tsdoc` comments.

## Contributing

Espells is welcome to PRs, issues, etc. Any contributions must maintain "parity" with Hunspell, although there is obviously some nuance to that idea.

If you want to understand how Espells work, the source files are _fully_ documented. Additionally, you can take a look at [Spyll's documentation](https://spylls.readthedocs.io/en/latest/) for additional perspective and reasoning about certain technical details.

### Building

Espells is built using TypeScript, with no special build tools. You can use the following command:

```
npm run build
```

## License

MIT licensed. See the [license file](LICENSE) for more details.
