export const HONOR_ROLL_OPTIONAL_DISCOUNT = 0.5;

export const ageUnits = ['months', 'years'] as const;

export const ageDivisions = [
  '0 - 2 years',
  '3 - 6 years',
  '7 - 9 years',
  '10 - 12 years',
  '13 - 15 years',
  '16 - 20 years',
  '21 - 28 years',
  '29 + years',
] as const;

export const entryLevels = [
  { value: 'honor_roll', label: 'Honor Roll Contestant', feeCents: 33_000, depositCents: 10_000 },
  { value: 'winners_circle_125', label: "Winner's Circle Contestant — entry fee only", feeCents: 12_500, depositCents: 7_500 },
  { value: 'winners_circle_175', label: "Winner's Circle Contestant — entry fee plus contestant and chaperone party tickets", feeCents: 17_500, depositCents: 7_500 },
] as const;

export const usStates = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
  'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah',
  'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
] as const;

export const registrationSteps = [
  { shortTitle: 'Contestant details', title: 'Registration information' },
  { shortTitle: 'Entry level', title: 'Choose your entry level' },
  { shortTitle: 'Release & payment', title: 'Release and required payment' },
] as const;

export const importantInformation = [
  'Honor Roll entry fee: $330 with a $100 deposit due now. The deposit is subtracted from the entry fee.',
  "Winner's Circle entry fee: $125, or $175 including a party ticket for the contestant and chaperone. A $75 deposit is due now, and contestants must have already paid the World deposit.",
  'Honor Roll optional competitions are 50% off when paid in advance. Optionals paid at the door are regular price.',
  'The remaining entry fee is due on or before October 9, 2026 to lock in the Honor Roll price. After that date, preliminary-contestant pricing applies.',
  'Big Forms, photos, good luck messages, and ads are due October 15, 2026.',
  'The deposit must be paid as part of checkout. QuickBooks will email the paid deposit invoice and the remaining balance after registration.',
];

export const registrationReleaseText = `By electronically signing this form, I understand that the remainder of the contestant's entry fee is due on or before October 9, 2026. After that date, I may still register at preliminary-contestant pricing. I understand that all money received by Texas Our Little Miss is non-refundable and non-transferable if the contestant does not compete at the state competition. This form will secure the contestant's number and entry into the Texas Our Little Miss State Finals, October 30–November 1, 2026, in College Station, Texas.

I understand that Our Little Miss is a three-tier system and that if the contestant wins a top-four title—Queen, Princess, Mini Queen, or Personality Plus—at the state finals, she will be required to attend the World Competition in January 2027. If she does not attend the World Competition, she forfeits the title and all awards received, including crown, banner, and trophy, so the next contestant in line may represent Texas at the World Finals.

Winner's Circle contestants have already paid their World deposit and are attending the World pageant. They cannot win division titles, but they may win optionals they enter and other side awards.`;

export const requiredRegistrationFields = [
  'contestant_first_name', 'contestant_last_name', 'chaperone_first_name', 'chaperone_last_name',
  'contestant_date_of_birth', 'contestant_age', 'age_unit', 'address_line_1', 'city', 'state',
  'zip_code', 'phone', 'email', 'age_division', 'entry_level', 'signature_kind', 'release_accepted',
] as const;

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function entryLevelFor(value: string) {
  return entryLevels.find((level) => level.value === value);
}
