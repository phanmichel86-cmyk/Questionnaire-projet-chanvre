// Rendu Markdown minimal et sûr : le texte est échappé AVANT toute mise en forme,
// donc aucun HTML venant du modèle n'est interprété.
(function () {
  function echapper(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function enLigne(s) {
    s = echapper(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Références de la base : [fiche#3] ou [fiche#3, autre#1]
    s = s.replace(/\[((?:[\w\-]+#\d+(?:,\s*)?)+)\]/g, function (_, refs) {
      return refs.split(/,\s*/).map(function (r) {
        return '<span class="ref" data-ref="' + r + '">' + r.replace(/#/, " §") + "</span>";
      }).join(" ");
    });
    return s;
  }

  function cellules(ligne) {
    return ligne.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); });
  }

  window.rendreMarkdown = function (md) {
    var lignes = md.replace(/\r/g, "").split("\n");
    var html = [], i = 0;
    while (i < lignes.length) {
      var l = lignes[i];
      if (/^\s*$/.test(l)) { i++; continue; }
      var titre = l.match(/^(#{1,4})\s+(.*)$/);
      if (titre) {
        var n = Math.min(titre[1].length + 2, 6);
        html.push("<h" + n + ">" + enLigne(titre[2]) + "</h" + n + ">"); i++; continue;
      }
      if (/^```/.test(l)) {
        var code = []; i++;
        while (i < lignes.length && !/^```/.test(lignes[i])) code.push(lignes[i++]);
        i++; html.push("<pre><code>" + echapper(code.join("\n")) + "</code></pre>"); continue;
      }
      if (/^\s*\|/.test(l) && i + 1 < lignes.length && /^\s*\|?\s*:?-{2,}/.test(lignes[i + 1])) {
        var tete = cellules(l); i += 2;
        var t = "<div class=\"tableau\"><table><thead><tr>" + tete.map(function (c) { return "<th>" + enLigne(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
        while (i < lignes.length && /^\s*\|/.test(lignes[i])) {
          t += "<tr>" + cellules(lignes[i++]).map(function (c) { return "<td>" + enLigne(c) + "</td>"; }).join("") + "</tr>";
        }
        html.push(t + "</tbody></table></div>"); continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
        var ordonnee = /^\s*\d/.test(l), items = [];
        while (i < lignes.length && /^\s*([-*+]|\d+[.)])\s+/.test(lignes[i])) {
          items.push("<li>" + enLigne(lignes[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, "")) + "</li>");
        }
        var balise = ordonnee ? "ol" : "ul";
        html.push("<" + balise + ">" + items.join("") + "</" + balise + ">"); continue;
      }
      if (/^>\s?/.test(l)) {
        var cite = [];
        while (i < lignes.length && /^>\s?/.test(lignes[i])) cite.push(lignes[i++].replace(/^>\s?/, ""));
        html.push("<blockquote>" + enLigne(cite.join(" ")) + "</blockquote>"); continue;
      }
      if (/^---+\s*$/.test(l)) { html.push("<hr>"); i++; continue; }
      var para = [];
      while (i < lignes.length && !/^\s*$/.test(lignes[i]) && !/^(#{1,4}\s|```|\s*\||\s*([-*+]|\d+[.)])\s+|>)/.test(lignes[i])) {
        para.push(lignes[i++]);
      }
      if (!para.length) { para.push(lignes[i++]); }
      html.push("<p>" + para.map(enLigne).join("<br>") + "</p>");
    }
    return html.join("\n");
  };
})();
