import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Check, X, Tags, ChevronDown, ChevronRight } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface CustomGameName {
  id: string;
  name: string;
  is_active: boolean;
}

export const CustomGameNamesManager = () => {
  const { toast } = useToast();
  const [names, setNames] = useState<CustomGameName[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchNames();
  }, []);

  const fetchNames = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("custom_game_names")
      .select("id, name, is_active")
      .order("name");

    if (error) {
      toast({
        title: "Error",
        description: "Failed to load custom game names",
        variant: "destructive",
      });
    } else {
      setNames(data || []);
    }
    setIsLoading(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;

    setIsAdding(true);
    const { error } = await supabase
      .from("custom_game_names")
      .insert({ name: newName.trim() });

    if (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to add name",
        variant: "destructive",
      });
    } else {
      setNewName("");
      fetchNames();
      toast({ title: "Added", description: `"${newName.trim()}" added` });
    }
    setIsAdding(false);
  };

  const handleUpdate = async (id: string) => {
    if (!editingValue.trim()) return;

    const { error } = await supabase
      .from("custom_game_names")
      .update({ name: editingValue.trim() })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update name",
        variant: "destructive",
      });
    } else {
      setEditingId(null);
      fetchNames();
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase
      .from("custom_game_names")
      .update({ is_active: !currentActive })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to toggle status",
        variant: "destructive",
      });
    } else {
      fetchNames();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    const { error } = await supabase
      .from("custom_game_names")
      .delete()
      .eq("id", deleteId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete name",
        variant: "destructive",
      });
    } else {
      fetchNames();
      toast({ title: "Deleted", description: "Name removed" });
    }
    setDeleteId(null);
  };

  const startEdit = (item: CustomGameName) => {
    setEditingId(item.id);
    setEditingValue(item.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue("");
  };

  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="space-y-2">
      <CollapsibleTrigger className="flex items-center gap-2 pb-2 border-b w-full hover:bg-muted/30 rounded px-1 transition-colors">
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Tags className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Custom Game Names</h3>
        <span className="text-xs text-muted-foreground ml-auto">({names.length})</span>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3">
        {/* Add new name */}
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New game name..."
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={isAdding || !newName.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* List of names */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : names.length === 0 ? (
          <p className="text-sm text-muted-foreground">No custom names yet</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {names.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-2 rounded bg-muted/50"
              >
                {editingId === item.id ? (
                  <>
                    <Input
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      className="flex-1 h-8"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdate(item.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleUpdate(item.id)}>
                      <Check className="h-4 w-4 text-green-500" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className={`flex-1 text-sm ${!item.is_active ? "text-muted-foreground line-through" : ""}`}>
                      {item.name}
                    </span>
                    <Switch
                      checked={item.is_active}
                      onCheckedChange={() => handleToggleActive(item.id, item.is_active)}
                      className="scale-75"
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(item)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDeleteId(item.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this name?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this custom game name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Collapsible>
  );
};
