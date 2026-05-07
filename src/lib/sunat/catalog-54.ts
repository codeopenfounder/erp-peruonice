/**
 * Catalogo 54 SUNAT - Codigos de bienes y servicios sujetos al SPOT (detraccion).
 * Espejo del archivo en kronos-fact/src/lib/invoicing/sunat-catalog-54.ts.
 */

export interface DetractionCode {
  code: string;
  description: string;
  percentage: number;
}

export const DETRACTION_CODES: DetractionCode[] = [
  { code: "001", description: "Azucar y melaza de cana", percentage: 10 },
  { code: "008", description: "Madera", percentage: 4 },
  { code: "012", description: "Intermediacion laboral y tercerizacion", percentage: 12 },
  { code: "013", description: "Animales y carnes (carne y despojos comestibles)", percentage: 4 },
  { code: "014", description: "Arrendamiento de bienes muebles", percentage: 10 },
  { code: "017", description: "Mantenimiento y reparacion de bienes muebles", percentage: 12 },
  { code: "019", description: "Movimiento de carga", percentage: 10 },
  { code: "020", description: "Otros servicios empresariales", percentage: 12 },
  { code: "021", description: "Comision mercantil", percentage: 10 },
  { code: "022", description: "Fabricacion de bienes por encargo", percentage: 10 },
  { code: "023", description: "Servicio de transporte de personas", percentage: 10 },
  { code: "024", description: "Contratos de construccion", percentage: 4 },
  { code: "025", description: "Servicio de transporte de carga", percentage: 4 },
  { code: "027", description: "Servicio de transporte (Resolucion 057-2007/SUNAT)", percentage: 4 },
  { code: "030", description: "Contratos de construccion (Anexo 3)", percentage: 4 },
  { code: "037", description: "Demas servicios gravados con el IGV", percentage: 12 },
  { code: "040", description: "Bien inmueble gravado con IGV", percentage: 4 },
];

export const DEFAULT_DETRACTION_CODE = "037";
export const DETRACTION_MIN_AMOUNT = 700;
export const DEFAULT_DETRACTION_PAYMENT_METHOD = "001";

export function findDetractionCode(code: string): DetractionCode | undefined {
  return DETRACTION_CODES.find((c) => c.code === code);
}
