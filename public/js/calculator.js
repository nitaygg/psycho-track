import { examScales } from './data.js';

export function mapWeightedToGeneral(weighted) {
    if (weighted <= 50) return 200;
    if (weighted >= 150) return 800;
    const brackets = [
        [50, 200], [50.5, 201], [55, 233], [55.5, 234], [60, 267], [60.5, 268], [65, 300], 
        [65.5, 301], [70, 334], [70.5, 335], [75, 367], [75.5, 368], [80, 395], [80.5, 396], 
        [85, 421], [85.5, 422], [90, 448], [90.5, 449], [95, 474], [95.5, 475], [100, 501], 
        [100.5, 502], [105, 527], [105.5, 528], [110, 554], [110.5, 555], [115, 580], 
        [115.5, 581], [120, 607], [120.5, 608], [125, 634], [125.5, 635], [130, 660], 
        [130.5, 661], [135, 687], [135.5, 688], [140, 713], [140.5, 714], [145, 751], 
        [145.5, 752], [149.5, 795], [150, 800]
    ];
    for (let i = 0; i < brackets.length - 1; i++) {
        if (weighted >= brackets[i][0] && weighted <= brackets[i+1][0]) {
            let frac = (weighted - brackets[i][0]) / (brackets[i+1][0] - brackets[i][0]);
            return Math.round(brackets[i][1] + frac * (brackets[i+1][1] - brackets[i][1]));
        }
    }
    return 800;
}

export function calculateRealPsychoScore(rawV, rawQ, simId) {
    let scale = examScales[simId] || examScales['summer_2026'];
    let safeV = Math.min(rawV, scale.v.length - 1);
    let safeQ = Math.min(rawQ, scale.q.length - 1);
    
    let V = scale.v[safeV];
    let Q = scale.q[safeQ];
    
    let wMulti = (V + Q) / 2;
    let wVerbal = (3 * V + Q) / 4;
    let wQuant = (3 * Q + V) / 4;
    
    return { multi: mapWeightedToGeneral(wMulti), verbalEmp: mapWeightedToGeneral(wVerbal), quantEmp: mapWeightedToGeneral(wQuant) };
}