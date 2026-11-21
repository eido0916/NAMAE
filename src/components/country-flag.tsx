import Image from "next/image";

export function CountryFlag({ code, label }: { code: string; label: string }) {
  return <Image className="country-flag" src={`/flags/${code}.svg`} width={36} height={36} alt={label} unoptimized />;
}
