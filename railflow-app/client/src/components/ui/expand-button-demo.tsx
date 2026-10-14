import ExpandButton from "@/components/ui/expand-button";
import { Star } from "lucide-react";

export default function ExpandButtonDemo() {
  return <ExpandButton icon={<Star aria-hidden />} label="Star on GitHub" />;
}
