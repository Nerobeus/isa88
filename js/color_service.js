// color_service.js — Palette de 80 couleurs distinctes avec la méthode du golden angle

const ColorService = (() => {

  function getColor(emId) {
    if (!emId) return "hsl(0, 0%, 70%)"; // gris par défaut

    let hash = 0;
    for (let i = 0; i < emId.length; i++) {
      hash = (hash * 31 + emId.charCodeAt(i)) % 100000;
    }

    // Index sur 80 couleurs
    const idx = hash % 80;

    // Golden angle = 137.5° → répartit bien les couleurs
    const hue = (idx * 137.5) % 360;
    const sat = 70;   // saturation fixe pour équilibre
    const light = 50; // luminosité fixe pour contraste

    return `hsl(${Math.round(hue)}, ${sat}%, ${light}%)`;
  }

  function getTextColor(hslColor) {
    try {
      const parts = hslColor.match(/hsl\((\d+),\s*(\d+)%?,\s*(\d+)%?\)/);
      if (!parts) return "#000";
      const l = parseInt(parts[3], 10);
      return l > 50 ? "#000" : "#fff";
    } catch {
      return "#000";
    }
  }

  return {
    getColor,
    getTextColor
  };

})();