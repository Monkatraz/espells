import iterate from "iterare"
import { CONSTANTS as C } from "../constants"
import type { Reader } from "../reader"
import { Trie } from "../trie"
import { escapeRegExp, re, reverse, split } from "../util"
import { Prefix, Suffix } from "./affix"
import { Casing, GermanCasing, TurkicCasing } from "./casing"
import { CompoundPattern } from "./compound-pattern"
import { CompoundRule } from "./compound-rule"
import { ConvTable } from "./conv-table"
import { PhonetTable } from "./phonet-table"
import { RepPattern } from "./rep-pattern"
import type {
  AffData,
  CharacterMap,
  Flag,
  Flags,
  FlagSet,
  OverridableAffData,
  PrefixIndex,
  PrefixMap,
  SuffixIndex,
  SuffixMap
} from "./types"

export type {
  Flag,
  CharacterMap,
  PrefixMap,
  SuffixMap,
  PrefixIndex,
  SuffixIndex,
  Flags,
  FlagSet,
  AffData,
  OverridableAffData
}

/** A resolved and parsed representation of the data found in a Hunspell `.aff` file. */
export class Aff implements AffData {
  // check AffData for descriptions of these properties

  SET = "UTF-8" // unused
  FLAG: "short" | "long" | "numeric" | "UTF-8" = "short"
  LANG?: string
  WORDCHARS?: string // unused
  IGNORE?: Set<string>
  CHECKSHARPS = false
  FORBIDDENWORD?: string

  KEY = "qwertyuiop|asdfghjkl|zxcvbnm"
  TRY = ""
  NOSUGGEST?: Flag
  KEEPCASE?: Flag
  REP: Set<RepPattern> = new Set()
  MAP: CharacterMap = new Set()
  NOSPLITSUGS = false
  PHONE?: PhonetTable
  MAXCPDSUGS = 3
  MAXNGRAMSUGS = 4
  MAXDIFF = 1
  ONLYMAXDIFF = false

  PFX: PrefixMap = new Map()
  SFX: SuffixMap = new Map()
  NEEDAFFIX?: Flag
  CIRCUMFIX?: Flag
  COMPLEXPREFIXES = false
  FULLSTRIP = false

  BREAK: Set<RegExp> = C.DEFAULT_BREAK
  COMPOUNDRULE: Set<CompoundRule> = new Set()
  COMPOUNDMIN = 3
  COMPOUNDWORDMAX?: number
  COMPOUNDFLAG?: Flag
  COMPOUNDBEGIN?: Flag
  COMPOUNDMIDDLE?: Flag
  COMPOUNDEND?: Flag
  ONLYINCOMPOUND?: Flag
  COMPOUNDPERMITFLAG?: Flag
  COMPOUNDFORBIDFLAG?: Flag
  FORCEUCASE?: Flag
  CHECKCOMPOUNDCASE = false
  CHECKCOMPOUNDUP = false
  CHECKCOMPOUNDREP = false
  CHECKCOMPOUNDTRIPLE = false
  CHECKCOMPOUNDPATTERN: Set<CompoundPattern> = new Set()
  SIMPLIFIEDTRIPLE = false
  COMPOUNDSYLLABLE?: [number, string] // unused
  COMPOUNDMORESUFFIXES = false // unused
  COMPOUNDROOT?: Flag // unused

  ICONV?: ConvTable
  OCONV?: ConvTable

  AF: Flags[] = []
  AM: Set<string>[] = []

  WARN?: Flag
  FORBIDWARN = false
  SYLLABLENUM?: string // unused
  SUBSTANDARD?: Flag // unused

  /**
   * The {@link Casing} instance for this data. Usually just a normal
   * {@link Casing} instance, but it may also be {@link GermanCasing},
   * {@link TurkicCasing}, or something else entirely depending on configuration.
   */
  declare casing: Casing

  /** An index, more specifically a {@link Trie}, of {@link Prefix}es. */
  declare prefixesIndex: PrefixIndex

  /** An index, more specifically a {@link Trie}, of {@link Suffix}es. */
  declare suffixesIndex: SuffixIndex

  /**
   * @param reader - The {@link Reader} instance to parse with.
   * @param override - An optional object which allows for overriding
   *   whatever {@link AffData} that was parsed with something else.
   */
  constructor(reader: Reader, override?: OverridableAffData) {
    do {
      if (reader.done) break

      let [directive, ...args] = split(reader.line)

      // skip directive if it doesn't seem real
      if (!/^[A-Z]+$/.test(directive)) continue

      if (C.SYNONYMS.hasOwnProperty(directive)) directive = C.SYNONYMS[directive]

      switch (directive) {
        case "SET":
        case "KEY":
        case "TRY":
        case "WORDCHARS":
        case "LANG": {
          this[directive] = args[0]
          break
        }

        case "FLAG": {
          if (
            args[0] === "short" ||
            args[0] === "long" ||
            args[0] === "numeric" ||
            args[0] === "UTF-8"
          ) {
            this.FLAG = args[0]
          }
          // try alternatives
          else if (args[0] === "num") {
            this.FLAG = "numeric"
          }
          break
        }

        case "IGNORE": {
          this.IGNORE = new Set([...args])
          break
        }

        case "MAXDIFF":
        case "MAXNGRAMSUGS":
        case "MAXCPDSUGS":
        case "COMPOUNDMIN":
        case "COMPOUNDWORDMAX": {
          this[directive] = parseInt(args[0])
          break
        }

        case "NOSUGGEST":
        case "KEEPCASE":
        case "CIRCUMFIX":
        case "NEEDAFFIX":
        case "FORBIDDENWORD":
        case "WARN":
        case "COMPOUNDFLAG":
        case "COMPOUNDBEGIN":
        case "COMPOUNDMIDDLE":
        case "COMPOUNDEND":
        case "ONLYINCOMPOUND":
        case "COMPOUNDPERMITFLAG":
        case "COMPOUNDFORBIDFLAG":
        case "FORCEUCASE":
        case "SUBSTANDARD":
        case "SYLLABLENUM":
        case "COMPOUNDROOT": {
          this[directive] = this.parseFlag(args[0])
          break
        }

        case "COMPLEXPREFIXES":
        case "FULLSTRIP":
        case "NOSPLITSUGS":
        case "CHECKSHARPS":
        case "CHECKCOMPOUNDCASE":
        case "CHECKCOMPOUNDUP":
        case "CHECKCOMPOUNDREP":
        case "CHECKCOMPOUNDTRIPLE":
        case "SIMPLIFIEDTRIPLE":
        case "ONLYMAXDIFF":
        case "COMPOUNDMORESUFFIXES":
        case "FORBIDWARN": {
          this[directive] = true
          break
        }

        case "BREAK": {
          this.BREAK = new Set()
          reader.for(parseInt(args[0]), line => {
            let [, pattern] = split(line)
            pattern = escapeRegExp(pattern).replaceAll("\\^", "^").replaceAll("\\$", "$")
            this.BREAK.add(re`/${pattern}/g`)
          })
          break
        }

        case "COMPOUNDRULE": {
          reader.for(parseInt(args[0]), line => {
            const [, value] = split(line)
            this.COMPOUNDRULE.add(new CompoundRule(value, this))
          })
          break
        }

        case "ICONV":
        case "OCONV": {
          const pairs: [string, string][] = []
          reader.for(parseInt(args[0]), line => {
            const [, pattern, replacement] = split(line)
            pairs.push([pattern, replacement])
          })
          this[directive] = new ConvTable(pairs)
          break
        }

        case "REP": {
          reader.for(parseInt(args[0]), line => {
            const [, pattern, replacement] = split(line)
            this.REP.add(new RepPattern(pattern, replacement))
          })
          break
        }

        case "MAP": {
          reader.for(parseInt(args[0]), line => {
            const [, value] = split(line)
            this.MAP.add(
              iterate(value.matchAll(/\(.*?\)|./g))
                .map(match => match[0].replaceAll(/^\(|\)$/g, ""))
                .toSet()
            )
          })
          break
        }

        case "PFX": {
          const [flag, crossproduct, count] = args
          reader.for(parseInt(count), line => {
            const [, , strip, add, cond] = split(line)
            const prefix = new Prefix(flag, crossproduct, strip, add, cond, this)
            const set = this.PFX.get(flag) ?? new Set()
            this.PFX.set(flag, set.add(prefix))
          })
          break
        }

        case "SFX": {
          const [flag, crossproduct, count] = args
          reader.for(parseInt(count), line => {
            const [, , strip, add, cond] = split(line)
            const suffix = new Suffix(flag, crossproduct, strip, add, cond, this)
            const set = this.SFX.get(flag) ?? new Set()
            this.SFX.set(flag, set.add(suffix))
          })
          break
        }

        case "CHECKCOMPOUNDPATTERN": {
          reader.for(parseInt(args[0]), line => {
            const [, left, right, replacement] = split(line)
            this.CHECKCOMPOUNDPATTERN.add(new CompoundPattern(left, right, replacement))
          })
          break
        }

        case "AF": {
          reader.for(parseInt(args[0]), line => {
            const [, value] = split(line)
            this.AF.push(this.parseFlags(value))
          })
          break
        }

        case "AM": {
          reader.for(parseInt(args[0]), line => {
            const [, value] = split(line)
            this.AM.push(new Set<string>(value.split("")))
          })
        }

        case "COMPOUNDSYLLABLE": {
          this.COMPOUNDSYLLABLE = [parseInt(args[0]), args[1]]
          break
        }

        case "PHONE": {
          const rules: [string, string][] = []
          reader.for(parseInt(args[0]), line => {
            const [, search, replacement] = split(line)
            rules.push([search, replacement])
          })
          this.PHONE = new PhonetTable(rules)
          break
        }
      }
    } while (reader.next())

    if (this.CHECKSHARPS) {
      this.casing = new GermanCasing()
    } else if (this.LANG && ["tr", "tr_TR", "az", "crh"].includes(this.LANG)) {
      this.casing = new TurkicCasing()
    } else {
      this.casing = new Casing()
    }

    this.prefixesIndex = new Trie()
    for (const [, prefixes] of this.PFX) {
      for (const prefix of prefixes) {
        this.prefixesIndex.add(prefix.add, set =>
          !set ? new Set([prefix]) : set.add(prefix)
        )
      }
    }

    this.suffixesIndex = new Trie()
    for (const [, suffixes] of this.SFX) {
      for (const suffix of suffixes) {
        this.suffixesIndex.add(reverse(suffix.add), set =>
          !set ? new Set([suffix]) : set.add(suffix)
        )
      }
    }

    if (override) Object.assign(this, override)
  }

  /** Parses a string and returns the first {@link Flag} found. */
  parseFlag(flag: string): Flag {
    return [...this.parseFlags(flag)][0]
  }

  /** Parses a string and returns the {@link Flags} found. */
  parseFlags(flags: string | string[]): Flags {
    if (typeof flags === "string") flags = [flags]

    const result = flags.flatMap(flag => {
      if (this.AF.length && this.AF[parseInt(flag) - 1]) {
        return [...this.AF[parseInt(flag) - 1]]
      }

      // prettier-ignore
      switch (this.FLAG) {
        case "UTF-8":
        case "short": return [...flag]
        case "long": return C.FLAG_LONG_REGEX.exec(flag)?.slice(1) ?? []
        case "numeric": return C.FLAG_NUM_REGEX.exec(flag)?.slice(1) ?? []
      }
    })

    return new Set(result)
  }

  /**
   * Utility for handling special cases involving the `CHECKSHARPS`
   * directive. Returns false if the directive itself is disabled, but
   * otherwise will determine if the given word contains a `ß`.
   */
  isSharps(word: string) {
    if (!this.CHECKSHARPS) return false
    return word.includes("ß")
  }
}
