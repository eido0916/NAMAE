import Image from "next/image";
import { withBasePath } from "@/lib/base-path";

export function CountryFlag({ code, label }: { code: string; label: string }) {
  return <Image className="country-flag" src={withBasePath(`/flags/${code}.svg`)} width={36} height={36} alt={label} unoptimized />;
}
