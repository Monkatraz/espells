/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import fs from "fs/promises"
import * as uvu from "uvu"
import * as assert from "uvu/assert"
import { Espells } from "../lib/index.js"

const Base = uvu.suite("Base")
const Affixes = uvu.suite("Affixes")
const ExclusionFlags = uvu.suite("Exclusion Flags")
const InputOutput = uvu.suite("Input/Output")
const Break = uvu.suite("Break")
const Compounding = uvu.suite("Compounding")
const Misc = uvu.suite("Misc")
const EdgeCases = uvu.suite("Edge Cases")
const Special = uvu.suite("Special")

// known fails (mainly encoding based, not relevant)
// report(Base, "base")
// report(Base, "base_utf")

report(Base, "right_to_left_mark")
report(Base, "encoding")
report(Base, "flag")
report(Base, "flaglong")
report(Base, "flagnum")
report(Base, "flagutf8")
report(Base, "alias")
report(Base, "alias2")
report(Base, "alias3")
report(Base, "utf8")
report(Base, "utf8_bom")
report(Base, "utf8_bom2")

report(Affixes, "affixes")
report(Affixes, "complexprefixes")
report(Affixes, "complexprefixes2")
report(Affixes, "complexprefixesutf")
report(Affixes, "circumfix")
report(Affixes, "needaffix")
report(Affixes, "needaffix2")
report(Affixes, "needaffix3")
report(Affixes, "needaffix4")
report(Affixes, "needaffix5")
report(Affixes, "fullstrip")
report(Affixes, "zeroaffix")

report(ExclusionFlags, "allcaps")
report(ExclusionFlags, "allcaps2")
report(ExclusionFlags, "allcaps3")
report(ExclusionFlags, "allcaps_utf")
report(ExclusionFlags, "forbiddenword")
report(ExclusionFlags, "keepcase")
report(ExclusionFlags, "nosuggest")

report(Break, "breakdefault")
report(Break, "break")
report(Break, "breakoff")

report(InputOutput, "iconv")
report(InputOutput, "iconv2")
report(InputOutput, "oconv")
report(InputOutput, "oconv2")

report(Compounding, "compoundflag")
report(Compounding, "onlyincompound")
// report(Compounding, "onlyincompound2")
report(Compounding, "compoundaffix")
report(Compounding, "compoundaffix2")
report(Compounding, "compoundaffix3")
report(Compounding, "compoundrule")
report(Compounding, "compoundrule2")
report(Compounding, "compoundrule3")
report(Compounding, "compoundrule4")
report(Compounding, "compoundrule5")
report(Compounding, "compoundrule6")
report(Compounding, "compoundrule7")
report(Compounding, "compoundrule8")
report(Compounding, "checkcompoundcase")
report(Compounding, "checkcompoundcase2")
report(Compounding, "checkcompoundcaseutf")
report(Compounding, "checkcompounddup")
report(Compounding, "checkcompoundpattern")
// report(Compounding, "checkcompoundpattern2")
// report(Compounding, "checkcompoundpattern3")
// report(Compounding, "checkcompoundpattern4")
report(Compounding, "checkcompoundrep")
report(Compounding, "checkcompoundtriple")
report(Compounding, "compoundforbid")
report(Compounding, "simplifiedtriple")
report(Compounding, "wordpair")
report(Compounding, "forceucase")
report(Compounding, "utfcompound")
report(Compounding, "fogemorpheme")
report(Compounding, "opentaal_cpdpat")
report(Compounding, "opentaal_cpdpat2")
report(Compounding, "opentaal_forbiddenword1")
report(Compounding, "opentaal_forbiddenword2")
report(Compounding, "germancompounding")
report(Compounding, "germancompoundingold")

report(Misc, "ngram_utf_fix")
report(Misc, "opentaal_keepcase")
report(Misc, "ph2")
// report(Misc, "morph")
report(Misc, "utf8_nonbmp")
report(Misc, "warn")
report(Misc, "ignore")
report(Misc, "ignoresug")
report(Misc, "ignoreutf")
report(Misc, "checksharps")
report(Misc, "checksharpsutf")
report(Misc, "dotless_i")
report(Misc, "IJ")
report(Misc, "nepali")
report(Misc, "korean")
// report(Misc, "hu")

report(EdgeCases, "slash")
// report(EdgeCases, "timelimit")
report(EdgeCases, "1592880")
report(EdgeCases, "1975530")
report(EdgeCases, "2970240")
report(EdgeCases, "2970242")
report(EdgeCases, "2999225")
report(EdgeCases, "i35725")
report(EdgeCases, "i53643")
report(EdgeCases, "i54633")
// report(EdgeCases, "i54980")
report(EdgeCases, "i58202")

Special("French", async () => {
  const aff = await fs.readFile("./tests/fr/index.aff", "utf-8")
  const dic = await fs.readFile("./tests/fr/index.dic", "utf-8")
  const spellchecker = new Espells({ aff, dic })
  spellchecker.suggest("Blueberry")
})

Special("Large Affix Dictionary (Hungarian)", async () => {
  const aff = await fs.readFile("./tests/hu/index.aff", "utf-8");
  const dic = await fs.readFile("./tests/hu/index.dic", "utf-8");
  const spellchecker = new Espells({ aff, dic });
  
  const usedMemory = process.memoryUsage().heapUsed;

  //Use less than 512MB
  assert.ok(usedMemory < 1024 * 1024 * 512, "Exceeding maximum allowed memory!");

  let word, startTime, isWordCorrect, executionTime;
  
  word = "béka";// valid word, means frog
  startTime = performance.now();
  isWordCorrect = spellchecker.lookup(word).correct;
  executionTime = performance.now() - startTime;
  //Check result
  assert.ok(isWordCorrect === true, `Word \"${word}\" expected to be valid!`);
  //Use less than 1000ms (it actualy uses only a few miliseconds, but check it for future errors)
  assert.ok(executionTime < 1000)
  
  word = "békaart";// invalid word
  startTime = performance.now();
  isWordCorrect = spellchecker.lookup(word).correct;
  executionTime = performance.now() - startTime;
  //Check result
  assert.ok(isWordCorrect === false, `Word \"${word}\" expected to be invalid!`);
  //Use less than 1000ms (it actualy uses only a few miliseconds, but check it for future errors)
  assert.ok(executionTime < 1000)
})

Base.run()
Affixes.run()
ExclusionFlags.run()
Break.run()
InputOutput.run()
Compounding.run()
Misc.run()
EdgeCases.run()
Special.run()

async function fileExists(file) {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

function split(str) {
  return str
    .split("\n")
    .map(str => str.trim())
    .filter(Boolean)
}

async function getTest(name) {
  const dic = await fs.readFile(`./tests/fixtures/${name}.dic`, "utf8")
  const aff = await fs.readFile(`./tests/fixtures/${name}.aff`, "utf8")

  const test = { name, dic, aff }

  if (await fileExists(`./tests/fixtures/${name}.good`)) {
    test.good = await fs.readFile(`./tests/fixtures/${name}.good`, "utf8")
  }

  if (await fileExists(`./tests/fixtures/${name}.wrong`)) {
    test.wrong = await fs.readFile(`./tests/fixtures/${name}.wrong`, "utf8")
  }

  if (await fileExists(`./tests/fixtures/${name}.sug`)) {
    test.sug = await fs.readFile(`./tests/fixtures/${name}.sug`, "utf8")
  }

  return test
}

function runTest(test) {
  const { name, dic, aff, good, wrong, sug } = test

  const spellchecker = new Espells({ aff, dic })

  if (good) {
    for (const word of split(good)) {
      assert.ok(spellchecker.lookup(word).correct, word)
    }
  }

  if (wrong) {
    for (const word of split(wrong)) {
      assert.not(spellchecker.lookup(word).correct, word)
    }
  }

  // if (wrong && sug) {
  //   const wrongWord = split(wrong)[0]
  //   assert.equal(split(sug), spellchecker.suggest(wrongWord))
  // }
}

function report(suite, name) {
  suite(name, async () => {
    const test = await getTest(name)
    runTest(test)
  })
}
