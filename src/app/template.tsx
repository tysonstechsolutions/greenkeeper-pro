// Route transition wrapper. Next.js remounts a template on every navigation,
// which re-triggers the CSS entrance animation — pages glide in instead of
// popping. The animation lives in globals.css (.gk-route-enter) and is
// disabled for prefers-reduced-motion users there.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="gk-route-enter">{children}</div>;
}
