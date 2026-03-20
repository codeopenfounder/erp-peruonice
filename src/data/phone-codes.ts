// ---------------------------------------------------------------------------
// Phone country codes — LATAM + frequent international
// ---------------------------------------------------------------------------

export interface PhoneCode {
  country: string;
  code: string;      // ISO 3166-1 alpha-2
  dialCode: string;  // e.g. "+51"
  flag: string;      // emoji flag
}

export const PHONE_CODES: PhoneCode[] = [
  // — LATAM (sorted by relevance for Peruvian companies) —
  { country: "Peru", code: "PE", dialCode: "+51", flag: "\u{1F1F5}\u{1F1EA}" },
  { country: "Colombia", code: "CO", dialCode: "+57", flag: "\u{1F1E8}\u{1F1F4}" },
  { country: "Ecuador", code: "EC", dialCode: "+593", flag: "\u{1F1EA}\u{1F1E8}" },
  { country: "Bolivia", code: "BO", dialCode: "+591", flag: "\u{1F1E7}\u{1F1F4}" },
  { country: "Chile", code: "CL", dialCode: "+56", flag: "\u{1F1E8}\u{1F1F1}" },
  { country: "Argentina", code: "AR", dialCode: "+54", flag: "\u{1F1E6}\u{1F1F7}" },
  { country: "Brasil", code: "BR", dialCode: "+55", flag: "\u{1F1E7}\u{1F1F7}" },
  { country: "Venezuela", code: "VE", dialCode: "+58", flag: "\u{1F1FB}\u{1F1EA}" },
  { country: "Mexico", code: "MX", dialCode: "+52", flag: "\u{1F1F2}\u{1F1FD}" },
  { country: "Paraguay", code: "PY", dialCode: "+595", flag: "\u{1F1F5}\u{1F1FE}" },
  { country: "Uruguay", code: "UY", dialCode: "+598", flag: "\u{1F1FA}\u{1F1FE}" },
  { country: "Panama", code: "PA", dialCode: "+507", flag: "\u{1F1F5}\u{1F1E6}" },
  { country: "Costa Rica", code: "CR", dialCode: "+506", flag: "\u{1F1E8}\u{1F1F7}" },
  { country: "Guatemala", code: "GT", dialCode: "+502", flag: "\u{1F1EC}\u{1F1F9}" },
  { country: "Cuba", code: "CU", dialCode: "+53", flag: "\u{1F1E8}\u{1F1FA}" },
  { country: "Rep. Dominicana", code: "DO", dialCode: "+1809", flag: "\u{1F1E9}\u{1F1F4}" },
  { country: "Honduras", code: "HN", dialCode: "+504", flag: "\u{1F1ED}\u{1F1F3}" },
  { country: "El Salvador", code: "SV", dialCode: "+503", flag: "\u{1F1F8}\u{1F1FB}" },
  { country: "Nicaragua", code: "NI", dialCode: "+505", flag: "\u{1F1F3}\u{1F1EE}" },
  { country: "Puerto Rico", code: "PR", dialCode: "+1787", flag: "\u{1F1F5}\u{1F1F7}" },
  // — International frequent —
  { country: "Estados Unidos", code: "US", dialCode: "+1", flag: "\u{1F1FA}\u{1F1F8}" },
  { country: "Espana", code: "ES", dialCode: "+34", flag: "\u{1F1EA}\u{1F1F8}" },
  { country: "Canada", code: "CA", dialCode: "+1", flag: "\u{1F1E8}\u{1F1E6}" },
  { country: "Italia", code: "IT", dialCode: "+39", flag: "\u{1F1EE}\u{1F1F9}" },
  { country: "Japon", code: "JP", dialCode: "+81", flag: "\u{1F1EF}\u{1F1F5}" },
  { country: "China", code: "CN", dialCode: "+86", flag: "\u{1F1E8}\u{1F1F3}" },
];

export const DEFAULT_PHONE_CODE = PHONE_CODES[0]; // Peru

/** Find a PhoneCode by ISO code */
export function findPhoneCodeByISO(iso: string): PhoneCode | undefined {
  return PHONE_CODES.find((p) => p.code === iso);
}

/** Find a PhoneCode by dial code (e.g. "+51") */
export function findPhoneCodeByDial(dial: string): PhoneCode | undefined {
  return PHONE_CODES.find((p) => p.dialCode === dial);
}
