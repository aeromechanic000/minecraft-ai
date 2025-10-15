
import * as skills from '../../agent/library/skills.js';
import * as world from '../../agent/library/world.js';
import * as mc from '../../utils/mcdata.js';
import settings from '../../../settings.js';

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
        this.achievedCriteria = new Map();
    }

    init() {
        this.agent.bot._client.on('advancements', (packet) => {
            if (packet.reset) {
                this.achievedCriteria.clear();
                return;
            }

            console.log('Received advancements packet.');
            const progress = packet.progressMapping || {};
            // console.log('Advancements progress:', progress);

            for (const [advId, entry] of Object.entries(progress)) {
                const nowCriteria = this.extractAchievedCriteria(entry);
                // console.log('Advancement:', advId, entry);
                // console.log('Now criteria:', nowCriteria);
                const wasCriteria = this.achievedCriteria.get(advId) || new Set();

                // Newly achieved criteria = now - was
                const newlyAchieved = [];
                for (const c of nowCriteria) {
                    if (!wasCriteria.has(c)) newlyAchieved.push(c);
                }

                // Emit events
                if (newlyAchieved.length > 0) {
                    console.log(`Newly achieved criteria of advancement: ${entry.key}`);
                    for (const crit of newlyAchieved) {
                        console.log(`- ${crit}`);
                    }
                }
                this.markSnapshot(advId, nowCriteria);
            }

        })
    }

    getPluginActions() {
        return [
        ]
    }

    extractAchievedCriteria(progressEntry) {
        const set = new Set();
        // console.log('Extracting achieved criteria from entry:', progressEntry);
        if (!progressEntry || !progressEntry.value) return set;
        for (const crit of progressEntry.value) {
            // console.log('Criterion:', crit);
            if (crit.criterionProgress) set.add(crit.criterionIdentifier);
        }
        return set;
    }
    
    markSnapshot(advId, achievedSet) {
        this.achievedCriteria.set(advId, new Set(achievedSet));
    }
}