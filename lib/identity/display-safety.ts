const UNSAFE_YBC_DISPLAY_CHARACTERS =
  /[\p{Default_Ignorable_Code_Point}\p{Cc}\p{Noncharacter_Code_Point}\u2800\u3000\ufff9-\ufffb]/u;

/**
 * Rejects controls, Unicode default-ignorables, noncharacters, and deceptive
 * blank glyphs before a producer-controlled or locally stored identity is
 * shown as a person's primary label.
 */
export function hasUnsafeIdentityDisplayCharacters(value: string): boolean {
  return UNSAFE_YBC_DISPLAY_CHARACTERS.test(value);
}
