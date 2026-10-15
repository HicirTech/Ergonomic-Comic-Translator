/** Every spelling and reading of a Japanese dictionary, readings in katakana, to check a reading against. */
export interface JapaneseDictionary {
  has(form: string): boolean;
}
