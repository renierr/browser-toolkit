export interface Isotope {
  isotope: string;
  mass: number;
  abundance: string;
}

export interface Element {
  number: number;
  symbol: string;
  name: string;
  mass: number;
  category: string;
  shells: number[];
  config: string;
  electronegativity: number | null;
  density: number | null;
  isotopes: Isotope[];
  x: number;
  y: number;
}
