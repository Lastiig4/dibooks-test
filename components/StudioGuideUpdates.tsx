import type { ReactNode } from "react";

const lessons: { title: string; summary: string; steps: string[] }[] = [
  {
    title: "Node-instellingen en veilig werken",
    summary: "Klik een node voor het instellingenvenster. Kladblokken openen direct als notitie. Gebruik Editor Lock, Undo en de gekleurde minimap.",
    steps: [
      "Klik op een geplaatste node om de instellingen te openen. Bovenaan staan de basisvelden; daaronder vind je de inhoud en routes die bij dat type horen. Sluiten behoudt je selectie. Een kladblok opent direct als tekstblok en heeft een verwijderknop.",
      "Met Editor Lock voorkom je onbedoelde wijzigingen. Undo maakt ondersteunde bewerkingen ongedaan; bewaar voor grote wijzigingen ook een projectbackup. Gebruik de zoomknoppen en de minimap met gekleurde kruisjes om je verhaal terug te vinden.",
      "Scène-info is bedoeld voor bijvoorbeeld tijd, datum of locatie bij een tekstscène. Reader feedback bij een variabele-actie is een melding aan de lezer, zoals een ontvangen voorwerp. Dit is iets anders dan feedback die een testlezer naar jou stuurt.",
    ],
  },
  {
    title: "Afbeeldingsnode",
    summary: "Een losse afbeelding op de leesroute, met een vervolgpath naar de volgende scène.",
    steps: [
      "Voeg een afbeeldingsnode toe via het mediamenu. Open de node, upload of kies de afbeelding en vul de beschikbare beschrijving en weergave-instellingen in.",
      "Verbind de vorige scène met de afbeelding en voeg een vervolgpath toe. Gebruik dit voor een zelfstandig beeldmoment. Wil je tekst naast een afbeelding, kies dan een Illustratiespread.",
    ],
  },
  {
    title: "Illustratiespread: tekst naast beeld",
    summary: "Upload een afbeelding, schrijf tekst en kies beeld links of rechts. Bij enkele pagina’s wisselt de lezer tussen tekst en illustratie.",
    steps: [
      "Voeg een Illustratiespread toe via het mediamenu. Upload de afbeelding en schrijf de scène in de teksteditor. Voeg net als bij een tekstnode de gewenste paths toe.",
      "Kies afbeelding rechts met tekst links, of andersom. Op een voldoende breed scherm zie je beide naast elkaar. Dezelfde afbeelding blijft bij alle tekstpagina’s van deze node; bij een volgende node wordt die indeling vervangen.",
      "Langzame beweging geeft de afbeelding automatisch een rustige zoom. Dit maakt geen afzonderlijke bewegende lagen van de foto. Met de horizontale en verticale focus bepaal je het belangrijke deel van de uitsnede. Je kunt de beweging als auteur uitschakelen; de lezer kan haar pauzeren. Een voorkeur voor minder beweging wordt gerespecteerd.",
      "Op een telefoon of in de enkele-paginastand staat eerst de tekst. De knop rechtsonder wisselt tussen Bekijk illustratie en Terug naar tekst, zonder de tekstpositie te verliezen. Deze knop staat alleen bij een illustratiespread. Controleer beide indelingen in het voorbeeld en test de paginering in de Reader.",
    ],
  },
  {
    title: "Special effects: mist, schudden en alarmlichten",
    summary: "Een effect-node regelt een effect tussen twee verhaalnodes. De effect-node zelf krijgt geen paths.",
    steps: [
      "Voeg een effect-node toe via het mediamenu en kies mist, schuddend scherm of pulserende alarmlichten in de vier hoeken. Stel waar beschikbaar de sterkte en de alarmkleur in. Bekijk het effect met de voorbeeldknop.",
      "Kies een bestaande beginnode en een andere eindnode. Het effect begint zodra de lezer de beginnode bereikt en is bij de eindnode uit. Verbind de effect-node zelf niet met paths: hij is een regel voor de leesroute, geen eigen boekpagina of start-node.",
      "Bij vertakkingen volgt het effect de werkelijk gelezen route. Als een tak het eindpunt overslaat, kan het effect aan blijven staan. Laat routes zo nodig weer samenkomen bij het eindpunt en gebruik Structuur → Verhaal controleren. Meerdere effecten kunnen tegelijk actief zijn. Test ook opnieuw lezen en alternatieve keuzes.",
    ],
  },
  {
    title: "Verhaalcontrole onder Structuur",
    summary: "Controleer start, paths, keuzes, media en effectroutes. Open een melding om direct naar de node te gaan.",
    steps: [
      "Open Structuur en kies Verhaal controleren. De resultaten blijven tijdens het bewerken actueel. De controle zoekt onder meer naar een ontbrekende start-node, ongeldige bestemmingen, lege keuzelabels, onbereikbare nodes en ontbrekende afbeeldingen of video’s.",
      "Bij een illustratiespread wordt ook lege tekst gemeld. Bij effects worden het effecttype, de begin- en eindnode en mogelijke routes naar het eindpunt gecontroleerd. Via Ga naar node open je de bijbehorende instellingen.",
      "Een route zonder vervolg krijgt een aandachtspunt. Kies Dit is bewust een einde als dat klopt. Die markering voegt geen path toe en verandert de Reader niet. Kladblokken en effect-nodes tellen niet als leesbare eindes. In een vergrendelde editor kun je eindmarkeringen niet wijzigen.",
      "Geen meldingen is geen garantie dat elke scène klopt. De controle speelt variabelen en voorwaarden niet uit en downloadt geen media om de bereikbaarheid te testen. Loop je belangrijkste routes ook zelf door in de preview en de Reader.",
    ],
  },
  {
    title: "Reader, bladwijzers en beoordelingen",
    summary: "Test enkele en dubbele pagina’s, de inhoudsopgave, bladwijzers en het einde van je verhaal.",
    steps: [
      "Test je boek op een breed scherm en met een enkele pagina. Controleer letterinstellingen, scène-info, afbeeldingen, keuzes, video's en minigames. Bij Inhoud ziet een lezer de bereikte hoofdstukken van de huidige route en opgeslagen bladwijzers. De aparte bladwijzerknop markeert de huidige leesplek.",
      "Aan het einde van een geschikt boek kan een lezer vrijwillig sterren en/of een recensie geven. Tutorialboeken zijn hiervan uitgesloten. Per account en boek is er één beoordeling; na een ingediende beoordeling of recensie verschijnt die vraag niet opnieuw bij herlezen.",
    ],
  },
  {
    title: "Samenwerken via gedeelde boeken",
    summary: "Ontvangen boeken hebben een eigen coverplank. Bij je eigen boek beheer je ontvangers, feedback en voorstellen.",
    steps: [
      "Sla je boek op in het Dashboard en deel het met een contact met de gewenste rechten: alleen lezen, lezen met feedback of ook een bewerkingsvoorstel. Je originele boek blijft op je eigen plank en krijgt bij actieve ontvangers het label Uitgeleend.",
      "De ontvanger opent de cover op Gedeelde boeken en ziet de acties die bij zijn rechten horen. Een bewerking wordt als voorstel teruggestuurd en vervangt niet direct jouw origineel.",
      "Open als eigenaar je boek om te zien met wie het gedeeld is en om uitlenen te annuleren. Ontvangen feedback en bewerkingsvoorstellen staan per boek onder elkaar. Bekijk voorstellen zorgvuldig: accepteren vervangt je conceptproject en zet het boek terug naar Concept; afwijzen neemt de wijziging niet over.",
    ],
  },
];

export default function StudioGuideUpdates({ full = false }: { full?: boolean }) {
  const shell = (title: string, children: ReactNode) => <section key={title} className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.04] p-5 sm:p-6"><h3 className="text-xl font-black text-amber-100">{title}</h3>{children}</section>;
  if (full) return <>{lessons.map((lesson, index) => shell((index + 11) + " • " + lesson.title, <div className="mt-4 space-y-3 text-sm leading-7 text-neutral-300">{lesson.steps.map(step => <p key={step}>{step}</p>)}</div>))}</>;
  return shell("Media, controle en samenwerken", <div className="mt-4 grid gap-4 sm:grid-cols-2">{lessons.map(lesson => <div key={lesson.title}><h4 className="font-bold text-white">{lesson.title}</h4><p className="mt-1 text-sm leading-6 text-neutral-300">{lesson.summary}</p></div>)}</div>);
}
