const fs = require("fs");
const path = require("path");

const roots = [
  process.cwd(),
  path.join(process.cwd(), "dibooks_author_studio"),
];

const target = roots
  .map(root => path.join(root, "app", "editor", "page.tsx"))
  .find(file => fs.existsSync(file));

if (!target) {
  console.error("❌ Kon app/editor/page.tsx niet vinden.");
  console.error("Voer dit script uit vanuit de hoofdmap van dibooks_author_studio.");
  process.exit(1);
}

let text = fs.readFileSync(target, "utf8");
const backup = target + ".bak_flags_variables_v2";

if (!fs.existsSync(backup)) {
  fs.copyFileSync(target, backup);
  console.log("✅ Backup gemaakt:", backup);
}

const replacements = [
  {
    "old": "type MiniGameDifficulty = \"easy\" | \"normal\" | \"hard\";",
    "new": "type MiniGameDifficulty = \"easy\" | \"normal\" | \"hard\";\n\ntype StoryVariableType = \"boolean\" | \"number\" | \"text\";\n\ntype StoryVariable = {\n  id: string;\n  name: string;\n  type: StoryVariableType;\n  defaultValue: boolean | number | string;\n  description?: string;\n};",
    "label": "Variable types toegevoegd"
  },
  {
    "old": "function SaveIcon() {\n",
    "new": "function VariablesIcon() {\n  return (\n    <svg\n      viewBox=\"0 0 24 24\"\n      className=\"h-7 w-7 fill-none stroke-current stroke-[2.2]\"\n      aria-hidden=\"true\"\n    >\n      <path d=\"M5 3v18\" />\n      <path d=\"M5 5h10l-2.5 4L15 13H5\" />\n      <circle cx=\"18\" cy=\"18\" r=\"3\" />\n      <path d=\"M18 16.5v3M16.5 18h3\" />\n    </svg>\n  );\n}\n\nfunction SaveIcon() {\n",
    "label": "Variables icoon toegevoegd"
  },
  {
    "old": "export default function Home() {",
    "new": "\ntype VariablesManagerModalProps = {\n  variables: StoryVariable[];\n  setVariables: React.Dispatch<React.SetStateAction<StoryVariable[]>>;\n  onClose: () => void;\n};\n\nfunction getDefaultValueForVariableType(type: StoryVariableType) {\n  if (type === \"boolean\") return false;\n  if (type === \"number\") return 0;\n  return \"\";\n}\n\nfunction normalizeVariableName(value: string) {\n  return value\n    .trim()\n    .replace(/\\s+/g, \"_\")\n    .replace(/[^a-zA-Z0-9_]/g, \"\")\n    .replace(/^[0-9]+/, \"\");\n}\n\nfunction VariablesManagerModal({\n  variables,\n  setVariables,\n  onClose,\n}: VariablesManagerModalProps) {\n  function addVariable() {\n    let index = variables.length + 1;\n    let name = `nieuwe_variabele_${index}`;\n\n    const existingNames = new Set(variables.map((variable) => variable.name));\n    while (existingNames.has(name)) {\n      index += 1;\n      name = `nieuwe_variabele_${index}`;\n    }\n\n    setVariables((current) => [\n      ...current,\n      {\n        id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,\n        name,\n        type: \"boolean\",\n        defaultValue: false,\n        description: \"\",\n      },\n    ]);\n  }\n\n  function updateVariable(id: string, updates: Partial<StoryVariable>) {\n    setVariables((current) =>\n      current.map((variable) =>\n        variable.id === id ? { ...variable, ...updates } : variable,\n      ),\n    );\n  }\n\n  function deleteVariable(variable: StoryVariable) {\n    const confirmed = window.confirm(\n      `Variabele \"${variable.name}\" verwijderen?\\n\\nLater controleren we automatisch of SET/IF-nodes deze variabele nog gebruiken.`,\n    );\n    if (!confirmed) return;\n\n    setVariables((current) =>\n      current.filter((item) => item.id !== variable.id),\n    );\n  }\n\n  const duplicateNames = new Set(\n    variables\n      .map((variable) => variable.name)\n      .filter(\n        (name, index, allNames) =>\n          name.length > 0 && allNames.indexOf(name) !== index,\n      ),\n  );\n\n  return (\n    <div className=\"fixed inset-0 z-[70] overflow-y-auto bg-black/80 p-4 sm:p-6\">\n      <div className=\"mx-auto max-w-5xl rounded-3xl border border-white/10 bg-neutral-950 shadow-2xl\">\n        <div className=\"sticky top-0 z-10 flex items-start justify-between gap-4 rounded-t-3xl border-b border-white/10 bg-neutral-950/95 p-5 backdrop-blur-xl sm:p-6\">\n          <div>\n            <p className=\"text-xs font-black uppercase tracking-[0.3em] text-amber-300\">\n              Story state\n            </p>\n            <h2 className=\"mt-2 text-3xl font-black text-white\">\n              Flags & Variabelen\n            </h2>\n            <p className=\"mt-2 max-w-2xl text-sm font-semibold leading-6 text-neutral-400\">\n              Maak hier alle waarden aan die het verhaal moet kunnen onthouden.\n              Deze lijst wordt opgeslagen in het boekproject en vormt straks de\n              bron voor SET-, IF-, keuzes- en minigame-logica.\n            </p>\n          </div>\n\n          <button\n            onClick={onClose}\n            className=\"rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-black text-white hover:bg-white/10\"\n          >\n            Sluiten\n          </button>\n        </div>\n\n        <div className=\"p-5 sm:p-6\">\n          <div className=\"mb-5 flex flex-wrap items-center justify-between gap-3\">\n            <div className=\"rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-100\">\n              {variables.length} {variables.length === 1 ? \"variabele\" : \"variabelen\"}\n            </div>\n\n            <button\n              onClick={addVariable}\n              className=\"rounded-2xl bg-amber-400 px-5 py-3 font-black text-black hover:bg-amber-300\"\n            >\n              + Nieuwe variabele\n            </button>\n          </div>\n\n          {variables.length === 0 ? (\n            <div className=\"rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center\">\n              <div className=\"text-5xl\">⚑</div>\n              <h3 className=\"mt-4 text-xl font-black text-white\">\n                Nog geen flags of variabelen\n              </h3>\n              <p className=\"mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-neutral-400\">\n                Voorbeeld: <strong className=\"text-white\">has_key</strong> als\n                boolean of <strong className=\"text-white\">xander_trust</strong>{\" \"}\n                als getal.\n              </p>\n            </div>\n          ) : (\n            <div className=\"grid gap-4\">\n              {variables.map((variable) => {\n                const duplicate = duplicateNames.has(variable.name);\n                const invalid = variable.name.trim().length === 0;\n\n                return (\n                  <div\n                    key={variable.id}\n                    className=\"rounded-3xl border border-white/10 bg-neutral-900 p-4 sm:p-5\"\n                  >\n                    <div className=\"grid gap-4 lg:grid-cols-[1.15fr_0.75fr_1fr_auto] lg:items-end\">\n                      <div>\n                        <label className=\"mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500\">\n                          Naam\n                        </label>\n                        <input\n                          value={variable.name}\n                          onChange={(event) =>\n                            updateVariable(variable.id, {\n                              name: event.target.value\n                                .replace(/\\s+/g, \"_\")\n                                .replace(/[^a-zA-Z0-9_]/g, \"\"),\n                            })\n                          }\n                          onBlur={() => {\n                            const normalized =\n                              normalizeVariableName(variable.name) ||\n                              `variabele_${variables.indexOf(variable) + 1}`;\n                            updateVariable(variable.id, { name: normalized });\n                          }}\n                          className={`w-full rounded-2xl border bg-black/35 px-4 py-3 font-mono font-bold text-white outline-none ${\n                            duplicate || invalid\n                              ? \"border-red-500 focus:border-red-400\"\n                              : \"border-white/10 focus:border-amber-400\"\n                          }`}\n                          placeholder=\"bijv. has_key\"\n                        />\n                        {(duplicate || invalid) && (\n                          <p className=\"mt-2 text-xs font-bold text-red-300\">\n                            {duplicate\n                              ? \"Deze naam bestaat al.\"\n                              : \"Een variabele heeft een naam nodig.\"}\n                          </p>\n                        )}\n                      </div>\n\n                      <div>\n                        <label className=\"mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500\">\n                          Type\n                        </label>\n                        <select\n                          value={variable.type}\n                          onChange={(event) => {\n                            const nextType =\n                              event.target.value as StoryVariableType;\n                            updateVariable(variable.id, {\n                              type: nextType,\n                              defaultValue:\n                                getDefaultValueForVariableType(nextType),\n                            });\n                          }}\n                          className=\"w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-amber-400\"\n                        >\n                          <option value=\"boolean\">True / False</option>\n                          <option value=\"number\">Getal</option>\n                          <option value=\"text\">Tekst</option>\n                        </select>\n                      </div>\n\n                      <div>\n                        <label className=\"mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500\">\n                          Startwaarde\n                        </label>\n\n                        {variable.type === \"boolean\" ? (\n                          <select\n                            value={String(Boolean(variable.defaultValue))}\n                            onChange={(event) =>\n                              updateVariable(variable.id, {\n                                defaultValue: event.target.value === \"true\",\n                              })\n                            }\n                            className=\"w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-amber-400\"\n                          >\n                            <option value=\"false\">false</option>\n                            <option value=\"true\">true</option>\n                          </select>\n                        ) : variable.type === \"number\" ? (\n                          <input\n                            type=\"number\"\n                            value={\n                              typeof variable.defaultValue === \"number\"\n                                ? variable.defaultValue\n                                : 0\n                            }\n                            onChange={(event) =>\n                              updateVariable(variable.id, {\n                                defaultValue:\n                                  event.target.value === \"\"\n                                    ? 0\n                                    : Number(event.target.value),\n                              })\n                            }\n                            className=\"w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-amber-400\"\n                          />\n                        ) : (\n                          <input\n                            value={String(variable.defaultValue ?? \"\")}\n                            onChange={(event) =>\n                              updateVariable(variable.id, {\n                                defaultValue: event.target.value,\n                              })\n                            }\n                            className=\"w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-amber-400\"\n                            placeholder='bijv. \"onbekend\"'\n                          />\n                        )}\n                      </div>\n\n                      <button\n                        onClick={() => deleteVariable(variable)}\n                        className=\"rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 font-black text-red-100 hover:bg-red-500/20\"\n                        title={`Verwijder ${variable.name}`}\n                      >\n                        Verwijder\n                      </button>\n                    </div>\n\n                    <div className=\"mt-4\">\n                      <label className=\"mb-2 block text-xs font-black uppercase tracking-widest text-neutral-500\">\n                        Omschrijving (optioneel)\n                      </label>\n                      <input\n                        value={variable.description ?? \"\"}\n                        onChange={(event) =>\n                          updateVariable(variable.id, {\n                            description: event.target.value,\n                          })\n                        }\n                        className=\"w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-amber-400\"\n                        placeholder=\"Waarvoor gebruikt de auteur deze variabele?\"\n                      />\n                    </div>\n\n                    <div className=\"mt-3 text-xs font-semibold text-neutral-500\">\n                      ID: <span className=\"font-mono\">{variable.id}</span>\n                    </div>\n                  </div>\n                );\n              })}\n            </div>\n          )}\n\n          <div className=\"mt-6 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 text-sm font-semibold leading-6 text-blue-100\">\n            De <strong>startwaarde</strong> is wat iedere nieuwe lezer krijgt.\n            Tijdens het lezen krijgt iedere savegame straks zijn eigen actuele\n            waarde. De auteurdefinitie en de reader-state blijven dus netjes\n            van elkaar gescheiden.\n          </div>\n        </div>\n      </div>\n    </div>\n  );\n}\n\nexport default function Home() {",
    "label": "Variables Manager modal toegevoegd"
  },
  {
    "old": "  const [saveDashboardOpen, setSaveDashboardOpen] = useState(false);\n",
    "new": "  const [saveDashboardOpen, setSaveDashboardOpen] = useState(false);\n  const [variablesOpen, setVariablesOpen] = useState(false);\n  const [storyVariables, setStoryVariables] = useState<StoryVariable[]>([]);\n",
    "label": "Variables state toegevoegd"
  },
  {
    "old": "        setStartNodeId(projectData.startNodeId ?? projectData.nodes?.[0]?.id ?? \"\");\n        setSelectedNodeId(projectData.startNodeId ?? projectData.nodes?.[0]?.id ?? null);\n",
    "new": "        setStartNodeId(projectData.startNodeId ?? projectData.nodes?.[0]?.id ?? \"\");\n        setSelectedNodeId(projectData.startNodeId ?? projectData.nodes?.[0]?.id ?? null);\n        setStoryVariables(\n          Array.isArray(projectData.variables) ? projectData.variables : [],\n        );\n",
    "label": "Dashboard laden ondersteunt variables"
  },
  {
    "old": "      bookTitle: dashboardSaveForm.title.trim() || \"Nieuw DiBooks verhaal\",\n      startNodeId,\n      nodes,\n      edges,\n",
    "new": "      bookTitle: dashboardSaveForm.title.trim() || \"Nieuw DiBooks verhaal\",\n      startNodeId,\n      variables: storyVariables,\n      nodes,\n      edges,\n",
    "label": "Projectbestand slaat variables op"
  },
  {
    "old": "        setNodes(projectData.nodes ?? []);\n        setEdges(projectData.edges ?? []);\n        setStartNodeId(projectData.startNodeId ?? \"\");\n        setDashboardBookId(null);\n",
    "new": "        setNodes(projectData.nodes ?? []);\n        setEdges(projectData.edges ?? []);\n        setStartNodeId(projectData.startNodeId ?? \"\");\n        setStoryVariables(\n          Array.isArray(projectData.variables) ? projectData.variables : [],\n        );\n        setDashboardBookId(null);\n",
    "label": "Lokale project-load ondersteunt variables"
  },
  {
    "old": "      bookTitle: dashboardSaveForm.title.trim() || \"Nieuw DiBooks verhaal\",\n      startNodeId,\n      nodes: nodes.map((node) => ({\n",
    "new": "      bookTitle: dashboardSaveForm.title.trim() || \"Nieuw DiBooks verhaal\",\n      startNodeId,\n      variables: storyVariables.map((variable) => ({\n        id: variable.id,\n        name: variable.name,\n        type: variable.type,\n        defaultValue: variable.defaultValue,\n        description: variable.description ?? \"\",\n      })),\n      nodes: nodes.map((node) => ({\n",
    "label": "Reader-export bevat variables"
  },
  {
    "old": "            <SidebarButton\n              onClick={saveProject}\n              label=\"Save menu\"\n              className=\"mt-6 bg-cyan-600 text-white hover:bg-cyan-500\"\n              icon={<SaveIcon />}\n            />\n",
    "new": "            <SidebarButton\n              onClick={() => setVariablesOpen(true)}\n              label=\"Flags & Variabelen\"\n              className=\"mt-6 bg-amber-500 text-black hover:bg-amber-400\"\n              icon={<VariablesIcon />}\n            />\n\n            <SidebarButton\n              onClick={saveProject}\n              label=\"Save menu\"\n              className=\"bg-cyan-600 text-white hover:bg-cyan-500\"\n              icon={<SaveIcon />}\n            />\n",
    "label": "Toolbar knop toegevoegd"
  },
  {
    "old": "      {editingTextNode &&\n",
    "new": "      {variablesOpen && (\n        <VariablesManagerModal\n          variables={storyVariables}\n          setVariables={setStoryVariables}\n          onClose={() => setVariablesOpen(false)}\n        />\n      )}\n\n      {editingTextNode &&\n",
    "label": "Variables modal gekoppeld"
  }
];

for (const item of replacements) {
  const first = text.indexOf(item.old);
  const last = text.lastIndexOf(item.old);

  if (first === -1) {
    console.error(`❌ Patch gestopt bij '${item.label}': geen match gevonden.`);
    console.error("Waarschijnlijk is page.tsx intussen gewijzigd of deze patch is al deels toegepast.");
    process.exit(2);
  }

  if (first !== last) {
    console.error(`❌ Patch gestopt bij '${item.label}': meer dan 1 match gevonden.`);
    process.exit(2);
  }

  text = text.slice(0, first) + item.new + text.slice(first + item.old.length);
  console.log("✅", item.label);
}

fs.writeFileSync(target, text, "utf8");

console.log("");
console.log("🎉 Flags & Variabelen basis is toegevoegd.");
console.log("Bestand bijgewerkt:", target);
console.log("");
console.log("Wat nu werkt:");
console.log("- Centrale Flags & Variabelen-knop in de linker toolbar");
console.log("- Boolean / Number / Text variabelen");
console.log("- Startwaarde + omschrijving");
console.log("- Opslag in projectbestand");
console.log("- Opslag in Dashboard projectData");
console.log("- Meenemen in reader story export");
console.log("- Oude projecten zonder variables blijven laden met een lege lijst");
