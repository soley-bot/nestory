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
    id: "central-residence",
    name: "Central Residence",
    code: "CTR-RES-018",
    type: "Serviced Apartment",
    owner: "Owner Group A",
    address: "District A",
    status: "Active",
    units: 24,
    occupiedUnits: 21,
    netIncome: "$18,420",
  },
  {
    id: "northline-mixed-use",
    name: "Northline Mixed Use",
    code: "NTH-MU-006",
    type: "Mixed Use",
    owner: "Owner Group B",
    address: "District B",
    status: "Active",
    units: 18,
    occupiedUnits: 15,
    netIncome: "$12,870",
  },
  {
    id: "canal-view-apartments",
    name: "Canal View Apartments",
    code: "CNV-APT-003",
    type: "Apartment",
    owner: "Private Owner",
    address: "District C",
    status: "Under Renovation",
    units: 12,
    occupiedUnits: 8,
    netIncome: "$7,940",
  },
];
