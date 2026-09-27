export function isTutorialMetadata(book: { official_tutorial?: boolean; officialTutorial?: boolean; primary_genre?: string; primaryGenre?: string; genres?: string[] }) {
  return book.official_tutorial === true || book.officialTutorial === true || [book.primary_genre, book.primaryGenre, ...(book.genres ?? [])].some(value => value?.trim().toLowerCase() === "tutorial");
}
export function canOfferBookReview(input: { eligible: boolean; intentionalEnd: boolean; replay: boolean; hasNextPage: boolean; hasNextRoute: boolean }) {
  return input.eligible && input.intentionalEnd && !input.replay && !input.hasNextPage && !input.hasNextRoute;
}
