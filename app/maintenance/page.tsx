export default function MaintenancePage() {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#05070d] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.2),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.18),transparent_34%),linear-gradient(180deg,#05070d_0%,#080b16_55%,#020308_100%)]" />
      <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-blue-600/10 blur-3xl" />
      <div className="absolute -right-24 bottom-24 h-80 w-80 rounded-full bg-purple-600/10 blur-3xl" />

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col justify-center px-6 py-16 sm:px-10">
        <div className="mb-10 flex items-end leading-none">
          <span className="text-5xl font-black tracking-tight text-white sm:text-7xl">DI</span>
          <span
            className="ml-1 text-5xl italic text-white sm:text-7xl"
            style={{ fontFamily: "Georgia, Times New Roman, serif" }}
          >
            Books
          </span>
        </div>

        <div className="max-w-3xl rounded-[2rem] border border-white/10 bg-white/[0.045] p-7 shadow-2xl backdrop-blur-xl sm:p-10">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">
            Tijdelijk in ontwikkeling
          </p>
          <h1 className="mt-5 text-4xl font-black leading-tight sm:text-6xl">
            DiBooks wordt gebouwd.
          </h1>
          <p className="mt-5 max-w-2xl text-base font-semibold leading-8 text-neutral-300 sm:text-lg">
            We werken aan de interactieve reader, Auteur Studio, accounts en publicatieflow. De website gaat weer open zodra alles goed getest is.
          </p>

          <div className="mt-8 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-5 text-sm font-semibold leading-7 text-blue-100">
            Binnenkort beschikbaar.
          </div>
        </div>
      </section>
    </main>
  );
}
