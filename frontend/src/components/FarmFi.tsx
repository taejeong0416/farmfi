// Barrel re-export. FarmFi.tsx was split into per-component files under
// ./farmfi/** so parallel agents can own disjoint files. Existing page
// imports (`from "@/components/FarmFi"`) keep working unchanged.

export { Header } from "./farmfi/layout/Header";
export { Footer } from "./farmfi/layout/Footer";

export { Hero } from "./farmfi/home/Hero";
export { RoleCards } from "./farmfi/home/RoleCards";
export { Flow } from "./farmfi/home/Flow";
export { Stats } from "./farmfi/home/Stats";

export { DashboardShell } from "./farmfi/dashboard/DashboardShell";
export { Chart, Donut } from "./farmfi/dashboard/Chart";

export { SpaceForm, Field } from "./farmfi/space/SpaceForm";

export { ProjectsGrid } from "./farmfi/projects/ProjectsGrid";
export { ProjectDetail } from "./farmfi/projects/ProjectDetail";
export { PortfolioPanel } from "./farmfi/projects/PortfolioPanel";
export { MilestoneVerifyPanel } from "./farmfi/admin/MilestoneVerifyPanel";

export { Section } from "./farmfi/ui/Section";
export { Metric } from "./farmfi/ui/Metric";
export { Panel } from "./farmfi/ui/Panel";
export { GreenBand } from "./farmfi/ui/GreenBand";
export { Icon } from "./farmfi/ui/Icon";
