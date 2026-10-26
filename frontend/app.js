(function () {
  "use strict";

  var SUGGESTIONS = {
    particulier: [
      "Je rénove une maison en pierre : que faire contre les murs froids et humides ?",
      "Combien de temps sèche un mur en béton de chanvre ?",
      "Puis-je faire moi-même un enduit chanvre-chaux ?",
      "Le chanvre est-il assurable si j'autoconstruis ?"
    ],
    artisan: [
      "Quel dosage chènevotte / liant / eau pour un béton de chanvre de mur ?",
      "Comment positionner l'ossature bois dans un mur banché ?",
      "Quelles conditions météo pour couler du béton de chanvre ?",
      "Quelle finition sur un mur en béton de chanvre ?"
    ],
    prescripteur: [
      "Quelle résistance thermique pour un mur de 30 cm de béton de chanvre ?",
      "Le béton de chanvre relève-t-il de la technique courante pour l'assurance ?",
      "Quel apport du chanvre sur l'indicateur Ic construction de la RE2020 ?",
      "Comportement au feu des murs en béton de chanvre ?"
    ],
    commercial: [
      "Quelle chènevotte recommander à un maçon pour un béton de chanvre ?",
      "Un client trouve le chanvre trop cher : que lui répondre ?",
      "Quelles questions poser pour qualifier un projet de rénovation ?",
      "Quelle différence entre les fibres VF, VFL, KF et SKF ?"
    ]
  };

  var etat = { profil: "particulier", historique: [], code: null, codeRequis: false, enCours: false };
  var el = {
    conversation: document.getElementById("conversation"),
    accueil: document.getElementById("accueil"),
    suggestions: document.getElementById("suggestions"),
    formulaire: document.getElementById("formulaire"),
    question: document.getElementById("question"),
    envoyer: document.getElementById("envoyer"),
    profils: document.getElementById("profils"),
    nouvelle: document.getElementById("nouvelle"),
    dialogue: document.getElementById("dialogue-code"),
    code: document.getElementById("code")
  };

  function afficherSuggestions() {
    el.suggestions.innerHTML = "";
    SUGGESTIONS[etat.profil].forEach(function (texte) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "suggestion";
      b.textContent = texte;
      b.addEventListener("click", function () { envoyer(texte); });
      el.suggestions.appendChild(b);
    });
  }

  function choisirProfil(profil) {
    etat.profil = profil;
    Array.prototype.forEach.call(el.profils.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-checked", String(b.dataset.profil === profil));
    });
    afficherSuggestions();
  }

  el.profils.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-profil]");
    if (!b || etat.enCours) return;
    if (b.dataset.profil === "commercial" && etat.codeRequis && !etat.code) {
      el.code.value = "";
      el.dialogue.showModal();
      el.dialogue.addEventListener("close", function surFermeture() {
        el.dialogue.removeEventListener("close", surFermeture);
        if (el.dialogue.returnValue === "ok" && el.code.value) {
          etat.code = el.code.value;
          choisirProfil("commercial");
        }
      });
      return;
    }
    choisirProfil(b.dataset.profil);
  });

  el.nouvelle.addEventListener("click", function () {
    if (etat.enCours) return;
    etat.historique = [];
    Array.prototype.forEach.call(el.conversation.querySelectorAll(".message"), function (m) { m.remove(); });
    el.accueil.hidden = false;
    el.question.focus();
  });

  el.formulaire.addEventListener("submit", function (e) {
    e.preventDefault();
    envoyer(el.question.value);
  });

  el.question.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      el.formulaire.requestSubmit();
    }
  });

  function ajouterMessage(role) {
    var div = document.createElement("div");
    div.className = "message " + role;
    el.conversation.appendChild(div);
    return div;
  }

  function defiler() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  function envoyer(texte) {
    texte = (texte || "").trim();
    if (!texte || etat.enCours) return;
    etat.enCours = true;
    el.envoyer.disabled = true;
    el.accueil.hidden = true;
    el.question.value = "";

    ajouterMessage("utilisateur").textContent = texte;
    var bulle = ajouterMessage("expert");
    var statut = document.createElement("div");
    statut.className = "statut";
    statut.textContent = "Réflexion en cours…";
    var corps = document.createElement("div");
    corps.className = "corps";
    bulle.append(statut, corps);
    defiler();

    var reponse = "";
    var recherches = [];

    fetch("api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: texte,
        profil: etat.profil,
        historique: etat.historique,
        code_acces: etat.profil === "commercial" ? etat.code : null
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (err) {
          if (res.status === 403) etat.code = null;
          throw new Error(err.detail || "Erreur " + res.status);
        });
      }
      var lecteur = res.body.getReader();
      var decodeur = new TextDecoder();
      var tampon = "";
      function lire() {
        return lecteur.read().then(function (r) {
          if (r.done) return;
          tampon += decodeur.decode(r.value, { stream: true });
          var blocs = tampon.split("\n\n");
          tampon = blocs.pop();
          blocs.forEach(function (bloc) {
            var ligne = bloc.split("\n").find(function (l) { return l.indexOf("data: ") === 0; });
            if (ligne) traiter(JSON.parse(ligne.slice(6)));
          });
          return lire();
        });
      }
      return lire();
    }).catch(function (err) {
      afficherErreur(err.message || "Connexion impossible.");
    }).finally(function () {
      if (statut.isConnected && !statut.classList.contains("erreur")) statut.remove();
      if (reponse) {
        etat.historique.push({ role: "user", content: texte }, { role: "assistant", content: reponse });
        etat.historique = etat.historique.slice(-20);
      }
      etat.enCours = false;
      el.envoyer.disabled = false;
      el.question.focus();
    });

    function traiter(ev) {
      if (ev.type === "texte") {
        reponse += ev.texte;
        corps.innerHTML = window.rendreMarkdown(reponse);
        statut.textContent = "Rédaction…";
      } else if (ev.type === "recherche") {
        recherches.push(ev.requete);
        statut.textContent = "Recherche dans la base : « " + ev.requete + " »";
      } else if (ev.type === "sources") {
        afficherSources(ev.sources);
      } else if (ev.type === "erreur") {
        afficherErreur(ev.message);
      }
      defiler();
    }

    function afficherErreur(message) {
      statut.textContent = message;
      statut.classList.add("erreur");
    }

    function afficherSources(sources) {
      var citees = sources.filter(function (s) { return s.cite; });
      var liste = citees.length ? citees : sources;
      if (!liste.length) return;
      var details = document.createElement("details");
      details.className = "sources";
      var resume = document.createElement("summary");
      resume.textContent = (citees.length ? "Sources citées" : "Extraits consultés") + " (" + liste.length + ")";
      details.appendChild(resume);
      var ul = document.createElement("ul");
      liste.forEach(function (s) {
        var li = document.createElement("li");
        var badge = document.createElement("span");
        badge.className = "badge " + (s.origine === "prive" ? "badge-pc" : "badge-gen");
        badge.textContent = s.origine === "prive" ? "Planète Chanvre" : "Documentation";
        var texteSource = document.createElement("span");
        texteSource.textContent = s.titre + " — " + s.section + " ";
        var ref = document.createElement("code");
        ref.textContent = s.ref;
        li.append(badge, texteSource, ref);
        ul.appendChild(li);
      });
      details.appendChild(ul);
      bulle.appendChild(details);
    }
  }

  fetch("api/config").then(function (r) { return r.json(); }).then(function (c) {
    etat.codeRequis = !!c.code_requis_pour_commercial;
  }).catch(function () {});

  afficherSuggestions();
})();
