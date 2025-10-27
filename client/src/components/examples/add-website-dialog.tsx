import { AddWebsiteDialog } from "../add-website-dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function AddWebsiteDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)}>Open Dialog</Button>
      <AddWebsiteDialog
        open={open}
        onOpenChange={setOpen}
        onSubmit={(data) => {
          console.log("Website submitted:", data);
          setOpen(false);
        }}
        existingPatterns={[]}
      />
    </div>
  );
}
