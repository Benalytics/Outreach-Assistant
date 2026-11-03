// The email building blocks in seven languages. Every first email is
// greeting + opener + proof + ask, so the subject and the opener can be varied
// (and learned from replies) while the proof stays true to your service.
// The built-in wording is formal (Sie, vous, usted, Lei, u). DeepL can redo it
// formally or informally from the Compose tab.

export const LANGS = { en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", it: "Italian", nl: "Dutch" };

const BY_COUNTRY = {
  Germany: "de", Austria: "de", Switzerland: "de", France: "fr", Luxembourg: "fr", Belgium: "nl", Netherlands: "nl",
  Spain: "es", Mexico: "es", Argentina: "es", Colombia: "es", Chile: "es", Peru: "es", Portugal: "pt", Brazil: "pt", Italy: "it",
};

// The website's own language wins (a German author writing in English gets English), then the country.
export function pickLang({ siteLang, country } = {}) {
  if (siteLang && LANGS[siteLang]) return siteLang;
  return BY_COUNTRY[country] || "en";
}

// Countries where the "where I found you" line is added (GDPR and similar rules).
export const DISCLOSE = new Set(["Germany", "Austria", "France", "Spain", "Italy", "Portugal", "Netherlands", "Belgium", "Luxembourg",
  "Ireland", "Denmark", "Sweden", "Finland", "Poland", "Greece", "United Kingdom", "Switzerland", "Norway"]);

export const SEGS = ["author", "formatting", "publisher", "educator", "business"];

export const PACKS = {
  en: {
    greet: "Hi {first},", greetNoName: "Hi there,", fallbackBusiness: "your team",
    obs: {
      needs_art: "I saw you're looking for an illustrator.",
      upcoming: "I saw you have a new book on the way.",
      title: "I came across {title} and wanted to reach out.",
      quote: "I read \"{quote}\" on your website, which is why I'm writing.",
    },
    problem: {
      author: "Kids decide on page one whether a book is worth finishing, and the art makes that call.",
      formatting: "KDP bounces picture books over bleed, trim and text too close to the edge more than anything else.",
      publisher: "When an illustrator stalls or files bounce at the printer, the whole list slips.",
      educator: "Children learn more from pages they want to look at.",
      business: "A lead magnet that looks homemade quietly costs you sign-ups.",
    },
    question: {
      author: "Who's illustrating your next book?",
      formatting: "Will your next book pass KDP's file checks the first time?",
      publisher: "Is {business} lining up illustrators for upcoming titles?",
      educator: "Does {business} have workbooks or activity books planned?",
      business: "Is there a guide or workbook {business} has been meaning to polish?",
    },
    proof: {
      author: "I've illustrated 50+ children's books (35+ published), with characters that stay consistent on every page.",
      formatting: "I've formatted 50+ books that passed KDP and IngramSpark checks the first time, usually in 3 to 5 days.",
      publisher: "I've delivered 50+ children's books on time, with consistent characters and print-ready files.",
      educator: "I illustrate and lay out children's books, activity books and workbooks, 50+ so far, delivered print-ready.",
      business: "I design ebooks and workbooks to the same standard as my 50+ published books, usually in 3 to 5 days.",
    },
    ask: {
      author: "Can I send you a few samples in your book's style?",
      formatting: "Want a free sample page within 24 hours?",
      publisher: "Can I send a short portfolio?",
      educator: "Can I send a few samples?",
      business: "Want me to send a couple of examples?",
    },
    subjects: {
      question: "Quick question about your {p}, {first}",
      curiosity: "An idea for your next {p}",
      benefit: "{first}, making your next {p} stand out",
      personal: "About {title}",
    },
    nouns: { author: "book project", formatting: "formatting project", publisher: "illustration project", educator: "learning project", business: "ebook project" },
    f1: {
      author: "Here are a few picture book spreads I've illustrated, in case they spark ideas for your story: {samples}\n\nWhat stage is your manuscript at?",
      formatting: "Here are some book interiors I've formatted for KDP and IngramSpark: {samples}\n\nIs your book still in the works?",
      publisher: "A few recent children's book spreads and character sheets: {samples}\n\nIs {business} lining up illustrators for upcoming titles?",
      educator: "Here are some activity book and workbook pages I've made: {samples}\n\nIs anything like this on {business}'s plans?",
      business: "Here are a few ebooks and workbooks I've designed: {samples}\n\nIs there a guide you've been meaning to polish?",
    },
    f2: "I'll take it the timing isn't right, so this is my last email. If a new {p} comes up, I'd love to help.{reviews}",
    reviews: " What past clients say: {link}",
    optout: "Not interested? Just reply \"no\" and I won't email again.",
    found: "I found your contact details on {source}.",
    foundSite: "I found your contact details on your website.",
  },

  de: {
    greet: "Guten Tag {full},", greetNoName: "Guten Tag,", fallbackBusiness: "Ihr Team",
    obs: {
      needs_art: "Ich habe gesehen, dass Sie Illustrationen suchen.",
      upcoming: "Ich habe gesehen, dass Ihr nächstes Buch in Arbeit ist.",
      title: "Ich bin auf „{title}“ gestoßen und wollte mich melden.",
      quote: "Auf Ihrer Website las ich „{quote}“. Deshalb schreibe ich Ihnen.",
    },
    problem: {
      author: "Kinder entscheiden auf Seite eins, ob sie weiterlesen, und die Bilder geben den Ausschlag.",
      formatting: "KDP lehnt Bilderbücher meist wegen Beschnitt, Format oder Text zu nah am Rand ab.",
      publisher: "Stockt eine Illustration oder scheitern Dateien in der Druckerei, verschiebt sich das ganze Programm.",
      educator: "Kinder lernen mehr von Seiten, die sie gern ansehen.",
      business: "Ein Lead-Magnet, der selbst gebastelt aussieht, kostet Sie Anmeldungen.",
    },
    question: {
      author: "Wer illustriert Ihr nächstes Buch?",
      formatting: "Besteht Ihr nächstes Buch die Dateiprüfung von KDP beim ersten Mal?",
      publisher: "Sucht {business} Illustratoren für kommende Titel?",
      educator: "Plant {business} Arbeits- oder Aktivitätshefte?",
      business: "Gibt es einen Leitfaden oder ein Workbook, das {business} aufwerten möchte?",
    },
    proof: {
      author: "Ich habe über 50 Kinderbücher illustriert (35+ veröffentlicht), mit Figuren, die auf jeder Seite stimmig bleiben.",
      formatting: "Ich habe über 50 Bücher gesetzt, die KDP und IngramSpark auf Anhieb bestanden, meist in 3 bis 5 Tagen.",
      publisher: "Ich habe über 50 Kinderbücher pünktlich geliefert, mit stimmigen Figuren und druckfertigen Dateien.",
      educator: "Ich illustriere und gestalte Kinderbücher, Aktivitäts- und Arbeitshefte, bisher über 50, druckfertig.",
      business: "Ich gestalte E-Books und Workbooks im Standard meiner über 50 veröffentlichten Bücher, meist in 3 bis 5 Tagen.",
    },
    ask: {
      author: "Darf ich Ihnen ein paar Beispiele in Ihrem Stil schicken?",
      formatting: "Möchten Sie innerhalb von 24 Stunden eine kostenlose Probeseite?",
      publisher: "Darf ich Ihnen ein kurzes Portfolio schicken?",
      educator: "Darf ich Ihnen ein paar Beispiele schicken?",
      business: "Soll ich Ihnen ein paar Beispiele schicken?",
    },
    subjects: {
      question: "Kurze Frage zu Ihrem {p}",
      curiosity: "Eine Idee für Ihr nächstes {p}",
      benefit: "Damit Ihr nächstes {p} heraussticht",
      personal: "Zu „{title}“",
    },
    nouns: { author: "Buchprojekt", formatting: "Layout-Projekt", publisher: "Illustrationsprojekt", educator: "Lernprojekt", business: "E-Book-Projekt" },
    f1: {
      author: "Hier sind ein paar Bilderbuchseiten, die ich illustriert habe, vielleicht als Anregung für Ihre Geschichte: {samples}\n\nWie weit ist Ihr Manuskript?",
      formatting: "Hier sind einige Buchinnenteile, die ich für KDP und IngramSpark gesetzt habe: {samples}\n\nIst Ihr Buch noch in Arbeit?",
      publisher: "Hier ein paar aktuelle Kinderbuchseiten und Figurenblätter: {samples}\n\nSucht {business} Illustratoren für kommende Titel?",
      educator: "Hier sind einige Seiten aus Aktivitäts- und Arbeitsheften von mir: {samples}\n\nIst so etwas bei {business} geplant?",
      business: "Hier sind ein paar E-Books und Workbooks, die ich gestaltet habe: {samples}\n\nGibt es einen Leitfaden, den Sie aufwerten möchten?",
    },
    f2: "Ich nehme an, der Zeitpunkt passt gerade nicht, deshalb ist dies meine letzte E-Mail. Wenn ein neues {p} ansteht, helfe ich gern.{reviews}",
    reviews: " Was frühere Kunden sagen: {link}",
    optout: "Kein Interesse? Antworten Sie einfach „nein“, dann schreibe ich nicht wieder.",
    found: "Ihre Kontaktdaten habe ich auf {source} gefunden.",
    foundSite: "Ihre Kontaktdaten habe ich auf Ihrer Website gefunden.",
  },

  fr: {
    greet: "Bonjour {first},", greetNoName: "Bonjour,", fallbackBusiness: "votre équipe",
    obs: {
      needs_art: "J'ai vu que vous cherchez un illustrateur.",
      upcoming: "J'ai vu que votre prochain livre est en préparation.",
      title: "J'ai découvert « {title} » et je voulais vous écrire.",
      quote: "J'ai lu « {quote} » sur votre site, d'où ce message.",
    },
    problem: {
      author: "Dès la première page, les enfants décident si un livre vaut la peine, et les images tranchent.",
      formatting: "KDP refuse surtout les albums pour les fonds perdus, le format ou un texte trop près du bord.",
      publisher: "Quand un illustrateur prend du retard ou que l'imprimeur refuse les fichiers, tout le programme glisse.",
      educator: "Les enfants apprennent mieux avec des pages qu'ils ont envie de regarder.",
      business: "Un lead magnet qui fait « maison » vous coûte des inscriptions sans bruit.",
    },
    question: {
      author: "Qui illustrera votre prochain livre ?",
      formatting: "Votre prochain livre passera-t-il les contrôles de KDP du premier coup ?",
      publisher: "Est-ce que {business} cherche des illustrateurs pour ses prochains titres ?",
      educator: "Est-ce que {business} prévoit des cahiers d'activités ou d'exercices ?",
      business: "Y a-t-il un guide ou un cahier que {business} aimerait améliorer ?",
    },
    proof: {
      author: "J'ai illustré plus de 50 livres pour enfants (35+ publiés), avec des personnages cohérents à chaque page.",
      formatting: "J'ai mis en page plus de 50 livres validés par KDP et IngramSpark du premier coup, souvent en 3 à 5 jours.",
      publisher: "J'ai livré plus de 50 livres pour enfants dans les délais, avec des personnages cohérents et des fichiers prêts à imprimer.",
      educator: "J'illustre et mets en page des livres pour enfants, des cahiers d'activités et d'exercices, plus de 50 à ce jour.",
      business: "Je conçois des ebooks et des cahiers au niveau de mes 50+ livres publiés, souvent en 3 à 5 jours.",
    },
    ask: {
      author: "Puis-je vous envoyer quelques exemples dans le style de votre livre ?",
      formatting: "Voulez-vous une page d'essai gratuite sous 24 heures ?",
      publisher: "Puis-je vous envoyer un court portfolio ?",
      educator: "Puis-je vous envoyer quelques exemples ?",
      business: "Voulez-vous que je vous envoie quelques exemples ?",
    },
    subjects: {
      question: "Petite question sur votre {p}",
      curiosity: "Une idée pour votre prochain {p}",
      benefit: "Pour que votre prochain {p} se démarque",
      personal: "À propos de « {title} »",
    },
    nouns: { author: "projet de livre", formatting: "projet de mise en page", publisher: "projet d'illustration", educator: "projet pédagogique", business: "projet d'ebook" },
    f1: {
      author: "Voici quelques doubles pages d'albums que j'ai illustrées, pour vous donner des idées : {samples}\n\nOù en est votre manuscrit ?",
      formatting: "Voici quelques intérieurs de livres que j'ai mis en page pour KDP et IngramSpark : {samples}\n\nVotre livre est-il toujours en cours ?",
      publisher: "Quelques doubles pages et fiches personnages récentes : {samples}\n\nEst-ce que {business} cherche des illustrateurs pour ses prochains titres ?",
      educator: "Voici quelques pages de cahiers d'activités que j'ai réalisées : {samples}\n\nEst-ce dans les projets de {business} ?",
      business: "Voici quelques ebooks et cahiers que j'ai conçus : {samples}\n\nY a-t-il un guide que vous aimeriez améliorer ?",
    },
    f2: "Je suppose que ce n'est pas le bon moment, c'est donc mon dernier e-mail. Si un nouveau {p} se présente, ce sera avec plaisir.{reviews}",
    reviews: " Avis de mes clients : {link}",
    optout: "Ce n'est pas pour vous ? Répondez simplement « non » et je ne vous écrirai plus.",
    found: "J'ai trouvé vos coordonnées sur {source}.",
    foundSite: "J'ai trouvé vos coordonnées sur votre site.",
  },

  es: {
    greet: "Hola, {first}:", greetNoName: "Buenos días:", fallbackBusiness: "su equipo",
    obs: {
      needs_art: "Vi que está buscando ilustrador.",
      upcoming: "Vi que tiene un nuevo libro en camino.",
      title: "Encontré «{title}» y quise escribirle.",
      quote: "Leí «{quote}» en su web, y por eso le escribo.",
    },
    problem: {
      author: "Los niños deciden en la primera página si un libro merece la pena, y lo deciden las ilustraciones.",
      formatting: "KDP rechaza los álbumes sobre todo por el sangrado, el formato o texto demasiado cerca del borde.",
      publisher: "Cuando un ilustrador se retrasa o la imprenta rechaza los archivos, se retrasa todo el catálogo.",
      educator: "Los niños aprenden más con páginas que les apetece mirar.",
      business: "Un lead magnet con aspecto casero le cuesta suscriptores sin que lo note.",
    },
    question: {
      author: "¿Quién ilustrará su próximo libro?",
      formatting: "¿Pasará su próximo libro las revisiones de KDP a la primera?",
      publisher: "¿Busca {business} ilustradores para sus próximos títulos?",
      educator: "¿Tiene {business} cuadernos de actividades o de ejercicios en sus planes?",
      business: "¿Hay alguna guía o cuaderno que {business} quiera mejorar?",
    },
    proof: {
      author: "He ilustrado más de 50 libros infantiles (35+ publicados), con personajes coherentes en cada página.",
      formatting: "He maquetado más de 50 libros que pasaron las revisiones de KDP e IngramSpark a la primera, en 3 a 5 días.",
      publisher: "He entregado más de 50 libros infantiles a tiempo, con personajes coherentes y archivos listos para imprenta.",
      educator: "Ilustro y maqueto libros infantiles y cuadernos de actividades y de ejercicios, más de 50 hasta ahora.",
      business: "Diseño ebooks y cuadernos con el nivel de mis más de 50 libros publicados, en 3 a 5 días.",
    },
    ask: {
      author: "¿Le envío algunas muestras en el estilo de su libro?",
      formatting: "¿Quiere una página de prueba gratis en 24 horas?",
      publisher: "¿Le envío un portafolio breve?",
      educator: "¿Le envío algunas muestras?",
      business: "¿Le envío un par de ejemplos?",
    },
    subjects: {
      question: "Una pregunta sobre su {p}",
      curiosity: "Una idea para su próximo {p}",
      benefit: "Para que su próximo {p} destaque",
      personal: "Sobre «{title}»",
    },
    nouns: { author: "proyecto de libro", formatting: "proyecto de maquetación", publisher: "proyecto de ilustración", educator: "proyecto educativo", business: "proyecto de ebook" },
    f1: {
      author: "Le comparto algunas páginas de álbumes que he ilustrado, por si le dan ideas para su historia: {samples}\n\n¿En qué punto está su manuscrito?",
      formatting: "Aquí tiene algunos interiores que he maquetado para KDP e IngramSpark: {samples}\n\n¿Sigue trabajando en su libro?",
      publisher: "Algunas páginas y fichas de personajes recientes: {samples}\n\n¿Busca {business} ilustradores para sus próximos títulos?",
      educator: "Aquí tiene algunas páginas de cuadernos de actividades que he hecho: {samples}\n\n¿Está algo así en los planes de {business}?",
      business: "Aquí tiene algunos ebooks y cuadernos que he diseñado: {samples}\n\n¿Hay alguna guía que quiera mejorar?",
    },
    f2: "Entiendo que no es el momento, así que este es mi último correo. Si surge un nuevo {p}, me encantará ayudarle.{reviews}",
    reviews: " Opiniones de mis clientes: {link}",
    optout: "¿No le interesa? Responda «no» y no volveré a escribirle.",
    found: "Encontré sus datos de contacto en {source}.",
    foundSite: "Encontré sus datos de contacto en su web.",
  },

  it: {
    greet: "Buongiorno {first},", greetNoName: "Buongiorno,", fallbackBusiness: "il suo team",
    obs: {
      needs_art: "Ho visto che sta cercando un illustratore.",
      upcoming: "Ho visto che ha un nuovo libro in arrivo.",
      title: "Ho scoperto «{title}» e volevo scriverle.",
      quote: "Ho letto «{quote}» sul suo sito, per questo le scrivo.",
    },
    problem: {
      author: "I bambini decidono alla prima pagina se un libro vale la pena, e a deciderlo sono le illustrazioni.",
      formatting: "KDP rifiuta gli albi soprattutto per abbondanze, formato o testo troppo vicino al bordo.",
      publisher: "Quando un illustratore rallenta o la tipografia rifiuta i file, slitta tutto il catalogo.",
      educator: "I bambini imparano di più da pagine che hanno voglia di guardare.",
      business: "Un lead magnet dall'aspetto casalingo le fa perdere iscrizioni senza che se ne accorga.",
    },
    question: {
      author: "Chi illustrerà il suo prossimo libro?",
      formatting: "Il suo prossimo libro supererà i controlli di KDP al primo colpo?",
      publisher: "{business} cerca illustratori per i prossimi titoli?",
      educator: "{business} ha in programma quaderni di attività o di esercizi?",
      business: "C'è una guida o un quaderno che {business} vorrebbe migliorare?",
    },
    proof: {
      author: "Ho illustrato oltre 50 libri per bambini (35+ pubblicati), con personaggi coerenti in ogni pagina.",
      formatting: "Ho impaginato oltre 50 libri approvati da KDP e IngramSpark al primo colpo, di solito in 3-5 giorni.",
      publisher: "Ho consegnato oltre 50 libri per bambini nei tempi, con personaggi coerenti e file pronti per la stampa.",
      educator: "Illustro e impagino libri per bambini e quaderni di attività ed esercizi, oltre 50 finora.",
      business: "Progetto ebook e quaderni con lo standard dei miei oltre 50 libri pubblicati, di solito in 3-5 giorni.",
    },
    ask: {
      author: "Posso inviarle qualche esempio nello stile del suo libro?",
      formatting: "Vuole una pagina di prova gratuita entro 24 ore?",
      publisher: "Posso inviarle un breve portfolio?",
      educator: "Posso inviarle qualche esempio?",
      business: "Vuole che le invii un paio di esempi?",
    },
    subjects: {
      question: "Una domanda sul suo {p}",
      curiosity: "Un'idea per il suo prossimo {p}",
      benefit: "Perché il suo prossimo {p} si distingua",
      personal: "Su «{title}»",
    },
    nouns: { author: "progetto di libro", formatting: "progetto di impaginazione", publisher: "progetto di illustrazione", educator: "progetto didattico", business: "progetto di ebook" },
    f1: {
      author: "Ecco alcune tavole di albi che ho illustrato, magari le danno qualche idea per la sua storia: {samples}\n\nA che punto è il suo manoscritto?",
      formatting: "Ecco alcuni interni che ho impaginato per KDP e IngramSpark: {samples}\n\nIl suo libro è ancora in lavorazione?",
      publisher: "Alcune tavole e schede personaggio recenti: {samples}\n\n{business} cerca illustratori per i prossimi titoli?",
      educator: "Ecco alcune pagine di quaderni di attività che ho realizzato: {samples}\n\nQualcosa del genere è nei piani di {business}?",
      business: "Ecco alcuni ebook e quaderni che ho progettato: {samples}\n\nC'è una guida che vorrebbe migliorare?",
    },
    f2: "Immagino non sia il momento giusto, quindi questa è la mia ultima email. Se nascerà un nuovo {p}, sarò felice di aiutarla.{reviews}",
    reviews: " Cosa dicono i miei clienti: {link}",
    optout: "Non le interessa? Risponda «no» e non le scriverò più.",
    found: "Ho trovato i suoi contatti su {source}.",
    foundSite: "Ho trovato i suoi contatti sul suo sito.",
  },

  pt: {
    greet: "Olá {first},", greetNoName: "Olá,", fallbackBusiness: "a sua empresa",
    obs: {
      needs_art: "Vi que está à procura de um ilustrador.",
      upcoming: "Vi que tem um novo livro a caminho.",
      title: "Descobri «{title}» e resolvi escrever.",
      quote: "Li «{quote}» no seu site, e é por isso que escrevo.",
    },
    problem: {
      author: "As crianças decidem na primeira página se um livro vale a pena, e quem decide são as ilustrações.",
      formatting: "A KDP recusa livros ilustrados sobretudo por sangria, formato ou texto perto demais da margem.",
      publisher: "Quando um ilustrador atrasa ou a gráfica recusa os arquivos, todo o catálogo atrasa.",
      educator: "As crianças aprendem mais com páginas que têm vontade de ver.",
      business: "Um lead magnet com aparência amadora faz perder inscrições sem ninguém notar.",
    },
    question: {
      author: "Quem vai ilustrar o seu próximo livro?",
      formatting: "O seu próximo livro vai passar na revisão da KDP logo na primeira vez?",
      publisher: "{business} procura ilustradores para os próximos títulos?",
      educator: "{business} tem cadernos de atividades ou de exercícios nos planos?",
      business: "Há algum guia ou caderno que {business} queira melhorar?",
    },
    proof: {
      author: "Ilustrei mais de 50 livros infantis (35+ publicados), com personagens coerentes em todas as páginas.",
      formatting: "Formatei mais de 50 livros aprovados pela KDP e IngramSpark na primeira tentativa, normalmente em 3 a 5 dias.",
      publisher: "Entreguei mais de 50 livros infantis no prazo, com personagens coerentes e arquivos prontos para impressão.",
      educator: "Ilustro e formato livros infantis e cadernos de atividades e de exercícios, mais de 50 até agora.",
      business: "Crio ebooks e cadernos com o padrão dos meus mais de 50 livros publicados, normalmente em 3 a 5 dias.",
    },
    ask: {
      author: "Posso enviar alguns exemplos no estilo do seu livro?",
      formatting: "Quer uma página de teste grátis em 24 horas?",
      publisher: "Posso enviar um portfólio curto?",
      educator: "Posso enviar alguns exemplos?",
      business: "Quer que envie alguns exemplos?",
    },
    subjects: {
      question: "Uma pergunta sobre o seu {p}",
      curiosity: "Uma ideia para o seu próximo {p}",
      benefit: "Para o seu próximo {p} se destacar",
      personal: "Sobre «{title}»",
    },
    nouns: { author: "projeto de livro", formatting: "projeto de formatação", publisher: "projeto de ilustração", educator: "projeto educativo", business: "projeto de ebook" },
    f1: {
      author: "Aqui estão algumas páginas de livros ilustrados que fiz, caso deem ideias para a sua história: {samples}\n\nEm que fase está o seu manuscrito?",
      formatting: "Aqui estão alguns miolos de livros que formatei para a KDP e IngramSpark: {samples}\n\nO seu livro ainda está em andamento?",
      publisher: "Algumas páginas e fichas de personagens recentes: {samples}\n\n{business} procura ilustradores para os próximos títulos?",
      educator: "Aqui estão algumas páginas de cadernos de atividades que fiz: {samples}\n\nAlgo assim está nos planos de {business}?",
      business: "Aqui estão alguns ebooks e cadernos que criei: {samples}\n\nHá algum guia que gostaria de melhorar?",
    },
    f2: "Imagino que não seja o momento certo, por isso este é o meu último e-mail. Se surgir um novo {p}, será um prazer ajudar.{reviews}",
    reviews: " O que dizem os meus clientes: {link}",
    optout: "Não tem interesse? Responda apenas «não» e não volto a escrever.",
    found: "Encontrei os seus dados em {source}.",
    foundSite: "Encontrei os seus dados no seu site.",
  },

  nl: {
    greet: "Beste {first},", greetNoName: "Goedendag,", fallbackBusiness: "uw team",
    obs: {
      needs_art: "Ik zag dat u een illustrator zoekt.",
      upcoming: "Ik zag dat er een nieuw boek van u aankomt.",
      title: "Ik kwam “{title}” tegen en wilde u even schrijven.",
      quote: "Ik las “{quote}” op uw website, en daarom schrijf ik u.",
    },
    problem: {
      author: "Kinderen beslissen op de eerste pagina of een boek de moeite waard is, en de illustraties geven de doorslag.",
      formatting: "KDP keurt prentenboeken vooral af op afloop, formaat of tekst te dicht bij de rand.",
      publisher: "Als een illustrator vastloopt of de drukker bestanden afkeurt, schuift het hele fonds op.",
      educator: "Kinderen leren meer van pagina's waar ze graag naar kijken.",
      business: "Een leadmagnet die er zelfgemaakt uitziet, kost u stilletjes aanmeldingen.",
    },
    question: {
      author: "Wie illustreert uw volgende boek?",
      formatting: "Komt uw volgende boek in één keer door de controle van KDP?",
      publisher: "Zoekt {business} illustratoren voor komende titels?",
      educator: "Heeft {business} werkboeken of doeboeken gepland?",
      business: "Is er een gids of werkboek dat {business} wil opfrissen?",
    },
    proof: {
      author: "Ik heb ruim 50 kinderboeken geïllustreerd (35+ uitgegeven), met personages die op elke pagina gelijk blijven.",
      formatting: "Ik heb ruim 50 boeken opgemaakt die in één keer door KDP en IngramSpark kwamen, meestal in 3 tot 5 dagen.",
      publisher: "Ik heb ruim 50 kinderboeken op tijd geleverd, met consistente personages en drukklare bestanden.",
      educator: "Ik illustreer en ontwerp kinderboeken, doeboeken en werkboeken, ruim 50 tot nu toe, drukklaar.",
      business: "Ik ontwerp e-books en werkboeken op het niveau van mijn ruim 50 uitgegeven boeken, meestal in 3 tot 5 dagen.",
    },
    ask: {
      author: "Mag ik u een paar voorbeelden in de stijl van uw boek sturen?",
      formatting: "Wilt u binnen 24 uur een gratis proefpagina?",
      publisher: "Mag ik u een kort portfolio sturen?",
      educator: "Mag ik u een paar voorbeelden sturen?",
      business: "Zal ik u een paar voorbeelden sturen?",
    },
    subjects: {
      question: "Korte vraag over uw {p}",
      curiosity: "Een idee voor uw volgende {p}",
      benefit: "Zodat uw volgende {p} opvalt",
      personal: "Over “{title}”",
    },
    nouns: { author: "boekproject", formatting: "opmaakproject", publisher: "illustratieproject", educator: "leerproject", business: "e-bookproject" },
    f1: {
      author: "Hier zijn een paar prentenboekpagina's die ik heb geïllustreerd, misschien geven ze ideeën voor uw verhaal: {samples}\n\nHoe ver is uw manuscript?",
      formatting: "Hier zijn een paar binnenwerken die ik voor KDP en IngramSpark heb opgemaakt: {samples}\n\nWerkt u nog aan uw boek?",
      publisher: "Een paar recente kinderboekpagina's en personagebladen: {samples}\n\nZoekt {business} illustratoren voor komende titels?",
      educator: "Hier zijn een paar pagina's uit doeboeken en werkboeken die ik maakte: {samples}\n\nStaat zoiets op de planning van {business}?",
      business: "Hier zijn een paar e-books en werkboeken die ik heb ontworpen: {samples}\n\nIs er een gids die u wilt opfrissen?",
    },
    f2: "Ik neem aan dat de timing niet goed is, dus dit is mijn laatste e-mail. Als er een nieuw {p} komt, help ik graag.{reviews}",
    reviews: " Wat eerdere klanten zeggen: {link}",
    optout: "Geen interesse? Antwoord gewoon „nee” en ik mail u niet meer.",
    found: "Ik vond uw contactgegevens op {source}.",
    foundSite: "Ik vond uw contactgegevens op uw website.",
  },
};
