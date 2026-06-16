export type PropertySummary = {
  id: string;
  name: string;
  code: string;
  type: string;
  owner: string;
  address: string;
  status: "Active" | "Under Renovation" | "Archived";
  units: number;
  occupiedUnits: number;
  netIncome: string;
};

export const properties: PropertySummary[] = [
  {
    id: "bkk1-serviced-residence",
    name: "BKK1 Serviced Residence",
    code: "BKK1-SR-018",
    type: "Serviced Apartment",
    owner: "IPS Managed Portfolio",
    address: "BKK1, Phnom Penh",
    status: "Active",
    units: 24,
    occupiedUnits: 21,
    netIncome: "$18,420",
  },
  {
    id: "toul-kork-mixed-use",
    name: "Toul Kork Mixed Use Building",
    code: "TK-MU-006",
    type: "Mixed Use",
    owner: "Sokha Holdings",
    address: "Toul Kork, Phnom Penh",
    status: "Active",
    units: 18,
    occupiedUnits: 15,
    netIncome: "$12,870",
  },
  {
    id: "riverside-apartment-block",
    name: "Riverside Apartment Block",
    code: "RIV-APT-003",
    type: "Apartment",
    owner: "Private Owner",
    address: "Riverside, Phnom Penh",
    status: "Under Renovation",
    units: 12,
    occupiedUnits: 8,
    netIncome: "$7,940",
  },
];
