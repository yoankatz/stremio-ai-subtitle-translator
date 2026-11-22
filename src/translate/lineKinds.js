// A line with no letters in any script (music notes, "...", a number) has
// nothing to translate. It is kept as it is and never sent to a translator
// on its own, so it cannot make a file look "partly translated".

export const hasWords = (text) => /\p{L}/u.test(text);
