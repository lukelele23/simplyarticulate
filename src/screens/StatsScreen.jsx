import PracticeDashboard from "../components/PracticeDashboard.jsx";

export default function StatsScreen(props) {
  return (
    <section aria-label="Progress" className="grid w-full gap-6 pt-6">
      <PracticeDashboard {...props} />
    </section>
  );
}
