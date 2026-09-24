import type { Category } from "./meta";

/* Les pictos des cadences, à la chess.com : balle, éclair, chrono, infini. */
export default function CategoryIcon({
  category,
  className = "size-5",
}: {
  category: Category;
  className?: string;
}) {
  const paths: Record<Category, React.ReactNode> = {
    bullet: (
      <path
        className="fill-[#e3aa24] stroke-none"
        d="M4 20l2.5-6.5 8-8c1.8-1.8 4.6-2.3 5.5-1.5s.3 3.7-1.5 5.5l-8 8L4 20Z"
      />
    ),
    blitz: <path className="fill-[#f7c631] stroke-none" d="M13 2 4 14h6l-2 8 10-12h-6l1-8Z" />,
    rapid: (
      <g className="fill-none stroke-[#81b64c]" strokeWidth={2.4} strokeLinecap="round">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l3 2M10 2h4" />
      </g>
    ),
    unlimited: (
      <path
        className="fill-none stroke-[#8eb8e5]"
        strokeWidth={2.4}
        strokeLinecap="round"
        d="M7 9c-3 0-4 2-4 3s1 3 4 3c4 0 6-6 10-6 3 0 4 2 4 3s-1 3-4 3c-4 0-6-6-10-6Z"
      />
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {paths[category]}
    </svg>
  );
}
