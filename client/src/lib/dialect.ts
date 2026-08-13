/** Country/city text -> dialect label. Drives TTS locale and AI prompts;
 *  onboarding and settings must agree, so this lives in exactly one place. */
export function dialectFor(country: string): string {
  const c = country.toLowerCase();
  if (/(mexico|méxico)/.test(c)) return 'Mexican';
  if (/(argentina|uruguay)/.test(c)) return 'Rioplatense';
  if (/(colombia)/.test(c)) return 'Colombian';
  if (/(chile)/.test(c)) return 'Chilean';
  if (/(peru|perú|bolivia|ecuador)/.test(c)) return 'Andean';
  if (/(spain|españa)/.test(c)) return 'Castilian';
  if (/(guatemala|honduras|salvador|nicaragua|costa rica|panama|panamá)/.test(c)) return 'Central American';
  if (/(cuba|dominican|puerto rico)/.test(c)) return 'Caribbean';
  return 'Latin American';
}
