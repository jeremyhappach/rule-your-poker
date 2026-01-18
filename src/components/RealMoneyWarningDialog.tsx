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
import { DollarSign } from "lucide-react";

interface RealMoneyWarningDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const RealMoneyWarningDialog = ({ 
  open, 
  onConfirm, 
  onCancel 
}: RealMoneyWarningDialogProps) => {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="bg-gradient-to-br from-red-950 to-red-900 border-2 border-red-500">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-100 text-xl">
            <DollarSign className="h-6 w-6 text-green-400" />
            This is a Real Money Game!
          </AlertDialogTitle>
          <AlertDialogDescription className="text-red-200 text-base">
            You are about to join a session where real money is at stake. 
            Chips won or lost will affect your actual balance.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel 
            onClick={onCancel}
            className="bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className="bg-green-600 hover:bg-green-500 text-white font-bold"
          >
            I Acknowledge
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
