import type { Flags } from "../aff"

export type LKFlagsOpts = { prefix?: Flags; suffix?: Flags; forbidden?: Flags }

/** Context object for handling a {@link AffixForm} decomposing state. */
export class LKFlags {
  /** The set of prefix flags currently in the state. */
  declare prefix: Flags

  /** The set of suffix flags currently in the state. */
  declare suffix: Flags

  /** A set of flags that invalidates {@link AffixForm}s if they have one of them. */
  declare forbidden: Flags

  constructor(flags: LKFlagsOpts = {}) {
    const { prefix = new Set(), suffix = new Set(), forbidden = new Set() } = flags
    this.prefix = prefix
    this.suffix = suffix
    this.forbidden = forbidden
  }

  replace(flags: LKFlagsOpts) {
    const newFlags = {
      prefix: this.prefix,
      suffix: this.suffix,
      forbidden: this.forbidden,
      ...flags
    }
    return new LKFlags(newFlags)
  }

  static from(prefix: Flags, suffix: Flags, forbidden: Flags) {
    return new LKFlags({ prefix, suffix, forbidden })
  }
}
