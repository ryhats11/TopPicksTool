import { SubIdTable } from "../subid-table";

const mockSubIds = [
  {
    id: "1",
    value: "ABC-4829-XYZ",
    timestamp: Date.now() - 3600000,
  },
  {
    id: "2",
    value: "ABC-7251-MNP",
    timestamp: Date.now() - 7200000,
  },
  {
    id: "3",
    value: "ABC-9184-QRS",
    timestamp: Date.now() - 10800000,
  },
  {
    id: "4",
    value: "ABC-3562-DEF",
    timestamp: Date.now() - 14400000,
  },
];

export default function SubIdTableExample() {
  return (
    <div className="p-8 max-w-4xl">
      <SubIdTable
        subIds={mockSubIds}
        onCopy={(value) => console.log("Copied:", value)}
        onExportCSV={() => console.log("Export CSV clicked")}
        duplicateSubIds={new Set()}
      />
    </div>
  );
}
