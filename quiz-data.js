// Question provenance and recovery notes: docs/public-quiz-repair.md.
// Browser grading retains the challenge's existing browser-reported score policy.
const QUIZ_DATA = (() => {
  const q=(prompt,answer,wrong1,wrong2,wrong3,note)=>({prompt,choices:[answer,wrong1,wrong2,wrong3],answer,note});
  return {
    m1: {
  "title": "Why Ancient Wheat Dough Feels Different",
  "questions": [
    {
      "prompt": "Fresh milling changes the bowl because it brings in:",
      "choices": [
        "Only the endosperm",
        "The whole berry, including bran, germ, and endosperm",
        "Only bran and germ",
        "A lower protein flour"
      ],
      "answer": "The whole berry, including bran, germ, and endosperm",
      "note": "White flour is predictable because it is heavily refined. Fresh milled flour brings the entire wheat berry into the dough."
    },
    {
      "prompt": "What is the bran doing in fresh milled ancient wheat dough?",
      "choices": [
        "Building a stronger elastic web",
        "Interrupting gluten while its fiber binds water",
        "Stopping all fermentation",
        "Turning starch into sugar"
      ],
      "answer": "Interrupting gluten while its fiber binds water",
      "note": "Bran has sharp edges that can interrupt the gluten network, and its fiber competes for moisture."
    },
    {
      "prompt": "What does the germ contribute that refined white flour largely removes?",
      "choices": [
        "Aromatic oils and biological activity",
        "Extra commercial yeast",
        "Only starch",
        "A stronger gluten network"
      ],
      "answer": "Aromatic oils and biological activity",
      "note": "The germ brings flavor rich oils and more biological activity into the bowl."
    },
    {
      "prompt": "A starter must float before it is healthy enough to bake with.",
      "choices": [
        "True",
        "False"
      ],
      "answer": "False",
      "note": "The float test measures whether the starter trapped enough gas to float. A starter may be active and healthy without the elastic structure to hold that gas."
    },
    {
      "prompt": "An einkorn dough stretches easily but does not spring back. Which pair describes that behavior?",
      "choices": [
        "Low extensibility, high elasticity",
        "High extensibility, low elasticity",
        "High extensibility, high elasticity",
        "Low extensibility, low elasticity"
      ],
      "answer": "High extensibility, low elasticity",
      "note": "Einkorn can stretch beautifully, but its fragile network has limited ability to snap back."
    },
    {
      "prompt": "Why can a high protein number be misleading with einkorn?",
      "choices": [
        "Einkorn protein has no flavor",
        "Protein quantity does not guarantee modern wheat style gluten strength",
        "All einkorn flour is refined",
        "Protein prevents fermentation"
      ],
      "answer": "Protein quantity does not guarantee modern wheat style gluten strength",
      "note": "Einkorn can contain plenty of protein while producing gluten with very different strength and elasticity from modern bread wheat."
    },
    {
      "prompt": "What is the better response to fragile ancient wheat dough?",
      "choices": [
        "Knead harder until it behaves like modern wheat",
        "Add flour every time it feels sticky",
        "Use gentler development and stop before the network tears",
        "Skip fermentation"
      ],
      "answer": "Use gentler development and stop before the network tears",
      "note": "More force is not always more strength. Aggressive kneading can tear a fragile network."
    },
    {
      "prompt": "Fresh milled dough looks loose soon after mixing. What should you try before adding more flour?",
      "choices": [
        "Give the flour time to absorb the water",
        "Double the salt",
        "Add oil immediately",
        "Warm it as fast as possible"
      ],
      "answer": "Give the flour time to absorb the water",
      "note": "Bran absorbs water slowly. Hold some water back, give the flour time, and remember that sticky does not automatically mean too wet."
    },
    {
      "prompt": "Which starter pattern best matches spelt in the lesson?",
      "choices": [
        "A thick paste with a cracked top",
        "A strong dome that relaxes quickly",
        "No rise and no aroma",
        "A tall dome that stays tight for hours"
      ],
      "answer": "A strong dome that relaxes quickly",
      "note": "Spelt may look strong at first, but its silky, extensible structure can lose tension quickly at peak."
    },
    {
      "prompt": "Which clue best matches an einkorn starter?",
      "choices": [
        "Tiny surface bubbles, a modest spreading rise, and a buttery aroma",
        "A rigid web and tall dome",
        "A thick paste with an earthy aroma",
        "No visible activity"
      ],
      "answer": "Tiny surface bubbles, a modest spreading rise, and a buttery aroma",
      "note": "Einkorn often becomes softer and more liquid, with a modest rise and spreading rather than a dramatic dome."
    },
    {
      "prompt": "Which handling expectation is most useful for emmer?",
      "choices": [
        "Treat it exactly like high gluten bread flour",
        "Expect a more delicate network and build strength without overmixing",
        "Knead until it becomes extremely elastic",
        "Add flour until the dough stops moving"
      ],
      "answer": "Expect a more delicate network and build strength without overmixing",
      "note": "Emmer is wheat, but it does not promise the same balance of strength and elasticity as modern bread flour. Watch the dough and stop before development becomes damage."
    },
    {
      "prompt": "Why might a starter sink in the float test even when it is active?",
      "choices": [
        "It lacks enough elastic gluten to retain the gas",
        "It contains no microorganisms",
        "It is always overfed",
        "It needs sugar added"
      ],
      "answer": "It lacks enough elastic gluten to retain the gas",
      "note": "Activity and gas retention are different. Ancient wheat starters may make gas without building the elastic structure needed to float."
    },
    {
      "prompt": "What is the lesson’s recommended starting blend when introducing an ancient grain to a familiar starter?",
      "choices": [
        "100% ancient grain immediately",
        "75% ancient grain and 25% hard wheat",
        "25% ancient grain and 75% hard red or hard white wheat",
        "Equal parts ancient grain and rye"
      ],
      "answer": "25% ancient grain and 75% hard red or hard white wheat",
      "note": "The 25 to 75 blend introduces the new grain while keeping a stable elastic base that is easier to read."
    },
    {
      "prompt": "Why should you control temperature while testing a new grain?",
      "choices": [
        "Whole grain flour ferments faster, so changing grain and temperature together hides the cause",
        "Cold kitchens remove bran",
        "Warm dough creates more gluten",
        "Temperature changes the grain variety"
      ],
      "answer": "Whole grain flour ferments faster, so changing grain and temperature together hides the cause",
      "note": "Isolate the variable. A steady temperature helps you learn what the grain itself is doing."
    },
    {
      "prompt": "What is the main shift in thinking when baking with einkorn, emmer, or spelt?",
      "choices": [
        "Force every dough to match modern wheat",
        "Judge every starter by height alone",
        "Read each grain’s texture, aroma, rise, and timing instead of chasing one standard",
        "Use flour only as neutral structure"
      ],
      "answer": "Read each grain’s texture, aroma, rise, and timing instead of chasing one standard",
      "note": "Ancient grains change the equation. Flour is not just structure. It is a defining ingredient with its own behavior and flavor."
    }
  ]
},
    m3: {title:'From Berries to Bread',questions:[
      q('What does unsifted fresh-milled whole-grain flour retain?','Bran, germ, and endosperm','Only the endosperm','Only the bran','Only the germ','Milling the whole berry and keeping all the flour retains all three parts.'),
      q('What is commercial refined flour designed to offer bakers?','Consistency','Identical flavor to every whole grain','No need for fermentation','The entire unsifted berry','The lesson contrasts commercial consistency with the character and variability of fresh whole grain.'),
      q('What can changing the grain change in your dough?','Water absorption, gluten development, fermentation, and flavor','Only its color','Only the shape of the baked loaf','Nothing if the protein number is the same','The whole grain changes several variables in the bowl.'),
      q('Does protein percentage tell you everything about dough strength?','No; watch how the dough actually behaves','Yes; a higher number always means a taller loaf','Yes; all wheat proteins behave identically','Only if you knead for ten minutes','Protein quantity alone does not describe gluten quality or handling.'),
      q('What control does milling at home give you?','Choosing the grain and when to mill it','Making every grain behave identically','Removing the need to read the dough','Guaranteeing a particular loaf height','You choose what grain goes into the dough and when it becomes flour.'),
      q('A whole-grain starter sinks in the float test. What follows?','It may still be active; look at the culture as a whole','It is definitely dead','It must be thrown away','It cannot ferment bread','A whole-grain or rye starter can be active without passing the float test.'),
      q('What should guide your handling when you change flour?','The dough in front of you','Only the old mixing timer','Only the flour color','The height of somebody else’s loaf','Different grains can need different development, rest, and hydration.'),
      q('How does the lesson describe grain flavor?','It can be nutty, sweet, earthy, buttery, malty, or bold','All wheat tastes identical','Flavor comes only from added sugar','Only fermentation contributes flavor','Flour itself is a defining ingredient with its own flavor.'),
      q('Which learning sequence does the series follow?','Grain, mill, flour, starter, dough, bake','Bake, starter, mill, grain','Mixer speed, loaf height, flour color','Packaging, slicing, then grain','Understanding each stage helps you interpret what happens in the next.'),
      q('Changing the flour in a starter can change what?','Fermentation behavior and timing','Only the jar’s appearance','The grain’s species after feeding','Nothing if the feeding ratio stays the same','Grain changes can affect water absorption, enzymes, minerals, and microbial activity.')
    ]},
    m7: {title:'Rye Redefined',questions:[
      q('The sharp, licorice-like flavor in many deli rye breads usually comes from what?','Caraway','The rye bran alone','Salt','The loaf pan','Rye itself is earthy, mildly sweet, nutty, and malty; caraway has a separate strong flavor.'),
      q('Does a dark rye label always guarantee whole-grain flour?','No; check the mill’s description','Yes; dark always means whole grain','Only if it contains caraway','Only if it is sourdough','Rye labeling can vary between mills.'),
      q('What structure should you expect from a high-rye dough?','A sticky, paste-like dough rather than a wheat-style elastic network','A strong wheat windowpane','A dry ball that never sticks','A gluten-free dough','Rye contains gluten proteins but does not form the same stretchy network as wheat.'),
      q('What do rye arabinoxylans help do?','Bind water and contribute to a thick, sticky consistency','Remove all water from the loaf','Create a strong wheat-like windowpane','Prevent fermentation','These water-binding carbohydrates are sometimes called pentosans.'),
      q('What is a risk of adding flour until rye feels like wheat dough?','A dry, heavy loaf','Stronger rye gluten every time','Guaranteed larger holes','Slower starch breakdown with no trade-off','Stickiness alone is not proof that a rye formula needs more flour.'),
      q('What is the main mixing goal for a high-rye dough?','Even combination and hydration','A transparent wheat windowpane','Maximum mixer speed for a fixed time','Eliminating every trace of stickiness','You cannot knead rye into wheat. In wheat-heavy blends, develop the wheat as the recipe requires.'),
      q('Why does sourdough acidity matter in a high-rye loaf?','It helps control amylase and protect starch structure','It removes gluten','It replaces the need to bake fully','It guarantees an open wheat-like crumb','Acidity does structural work as well as contributing flavor.'),
      q('Which description distinguishes gummy crumb from a good close rye crumb?','Gummy crumb is wet and gluey and may smear on the knife','Every close crumb is gummy','A moist close crumb always means failure','A dark crust proves gumminess','A successful rye loaf can have a close crumb; wet gluey texture is a different problem.'),
      q('Before slicing a high-rye loaf, what should you do?','Cool it completely and follow the recipe’s resting time','Slice as soon as it leaves the oven','Add flour to the hot crumb','Re-knead it','The crumb needs time to settle and firm up; some rye loaves need an extended rest.'),
      q('What does a small rye addition of about 10–15% usually offer a wheat dough?','Rye flavor and moisture while handling remains mostly wheat-like','The same handling as a 100% rye dough','A gluten-free loaf','No change in flavor','The proportion of rye matters; the lesson’s ranges are guides, not rigid dividing lines.')
    ]},
    m2: {title:'The Kneading Fallacy',questions:[
      q('Why can a fixed ten-minute mixer routine fail with ancient wheat?','The grain’s delicate network may be damaged before the timer ends','Every mixer removes all protein','Ancient wheat cannot absorb water','More kneading always prevents collapse','Read the dough rather than assuming a standardized mixing time fits every grain.'),
      q('What does a higher protein number fail to guarantee?','Modern bread-wheat gluten strength','That protein is present','That the grain can be milled','That the flour has a color','Protein quantity and gluten quality are different.'),
      q('What does extensibility describe?','The ability to stretch','The ability to spring back','The speed of milling','The amount of salt','Extensible dough stretches; elasticity describes resistance and spring-back.'),
      q('What does elasticity describe?','Resistance and spring-back','Only the ability to stretch far','The flour’s aroma','The age of the grain','Modern bread wheat often provides a more elastic structural base.'),
      q('A spelt dough becomes a smeared puddle during mixing. What should you reconsider?','Whether continued mechanical mixing is damaging its structure','Whether the mixer needs still more speed','Whether all ancient grains need a rigid timer','Whether flour alone guarantees recovery','Aggressive work can weaken a delicate gluten network.'),
      q('Which method does the lesson recommend for developing extensible ancient-grain dough?','Gentle stretch-and-folds with rests','Uninterrupted maximum-speed mixing','Adding flour after every fold','Skipping hydration','Folds encourage organization without forcing the dough past its limits.'),
      q('Why rest fresh-milled dough between folds?','To allow hydration and structure to develop','To remove the bran','To change spelt into bread wheat','To halt all biological activity','Water and time help freshly milled flour hydrate.'),
      q('What can your hands tell you that a timer cannot?','How the dough’s resistance and tension are changing','Its exact protein percentage','The exact chromosome count','The mill’s brand name','Feeling healthy tension or the start of tearing helps guide handling.'),
      q('Can kneading turn one wheat species into another?','No; adapt the method to the grain','Yes, if the mixer is powerful enough','Yes, after ten minutes','Only when extra salt is added','Different grain structures call for different handling.'),
      q('What is the practical response when your flour changes?','Adjust handling based on the dough’s behavior','Keep every old mixing rule unchanged','Judge success only by loaf height','Assume all stickiness means too much water','The lesson’s central instruction is to respect the grain and read the dough.')
    ]},
    m4: {title:'Which Wheat Berry Should You Use?',questions:[
      q('Which wheat is generally suited to bread, pizza, and bagels?','Hard wheat','Soft white wheat for every formula','Any wheat regardless of strength','Only refined flour','Hard wheat generally offers stronger gluten potential and gas retention.'),
      q('Which wheat is the pastry specialist in the lesson?','Soft white','Hard red spring','Hard red winter','Hard white for every bake','Soft white’s weaker gluten supports tenderness in biscuits, cakes, pancakes, and pie crust.'),
      q('Does white wheat mean refined white flour?','No; white wheat can be 100% whole grain','Yes; its bran has always been removed','Yes; white wheat has no germ','Only when used for bread','Red versus white describes grain characteristics, including bran color and flavor.'),
      q('Which choice offers bread strength with a milder whole-grain flavor?','Hard white wheat','Soft white in every bread formula','Caraway alone','Removing all the germ','The lesson calls hard white the bridge wheat.'),
      q('What flavor does hard red commonly bring?','Robust, nutty, earthy whole-wheat character','No flavor at all','Always a licorice flavor','Only sweetness from added sugar','Hard red often tastes more assertive than hard white.'),
      q('Why might a 100% soft white loaf spread?','Its weaker gluten may not support bread-style structure','Soft white cannot be milled','White wheat is always refined','It must contain too much salt','Pastry wheat has a different job from a strong bread wheat.'),
      q('What does spring versus winter tell you?','Growing season and clues about protein and strength','Whether the flour is whole grain','The color of the finished crust','An absolute strength ranking for every crop','Variety, conditions, and crop year still matter.'),
      q('Which wheat often offers high strength and water absorption for demanding bread formulas?','Hard red spring','Soft white pastry wheat','Every winter wheat without exception','Only rye','Spring wheat can have high protein and strength, but evaluate the actual grain and dough.'),
      q('Fresh whole-grain dough is sticky right after mixing. What may it need first?','Time for the bran to hydrate','An immediate large addition of flour','Maximum mixer speed','Removal of all salt','Bran absorbs water over time and can also interfere with gluten development.'),
      q('What is the useful question when choosing the best wheat?','Best for which bake and flavor?','Which always has the highest protein?','Which always needs the longest mixing?','Which has the palest bag?','Match the grain to the bread, pastry, flavor, and texture you want.')
    ]},
    m6: {title:'Mastering Einkorn',questions:[
      q('What does einkorn’s high protein content guarantee?','Neither strong modern-wheat gluten nor a tall loaf','A strong windowpane in every dough','Unlimited mixing tolerance','A dough that never sticks','Protein amount and gluten strength are separate characteristics.'),
      q('How many chromosomes does einkorn have in the lesson?','14','28','42','56','Einkorn is diploid; modern bread wheat has 42 chromosomes. Different does not mean better or worse.'),
      q('What handling character is common in einkorn dough?','High extensibility with comparatively low elasticity','Strong spring-back with no stretch','No gluten proteins','Identical behavior to all modern bread wheats','It can stretch readily yet have limited ability to resist, spring back, and hold shape.'),
      q('What should you try before adding flour to newly mixed sticky einkorn?','Let it rest and hydrate after holding back some water','Immediately double the flour','Knead until a strict timer ends','Remove all fermentation time','Give the bran time to hydrate before judging the final water requirement.'),
      q('What can aggressive mixing do to einkorn?','Damage its fragile structure','Turn it into strong modern bread wheat','Remove the germ','Guarantee larger oven spring','Mix until combined, allow rest, and use gentle folds without tearing.'),
      q('Why can waiting for einkorn to double be risky?','The dough may lose its remaining strength and collapse','Einkorn never ferments','Doubling removes all flavor','The bran becomes white flour','The lesson suggests watching aeration and roughly 40–50% expansion while structure remains, rather than blindly waiting for doubling.'),
      q('Which loaf characteristics can be normal for einkorn?','Modest lift, a tighter crumb, and some spreading or cracking','Only a huge open crumb counts as success','No fermentation or aroma','Always the same lift as strong bread flour','Judge the grain on its own behavior and intended loaf style.'),
      q('How can a pan help an einkorn loaf?','Support dough that has limited ability to hold a free-standing shape','Remove gluten','Eliminate the need for baking','Make fermentation unnecessary','A pan can supply support instead of forcing every dough into a free-standing boule.'),
      q('What introductory blend does the lesson suggest?','About 20% einkorn with hard white or hard red for the rest','100% einkorn as the only useful starting point','Mostly salt with a little einkorn','Only soft white and no einkorn','Let a stronger wheat carry structure while you learn einkorn’s flavor and handling.'),
      q('What is the central lesson for working with einkorn?','Learn its behavior and adapt your method','Force it to match modern wheat','Always fix stickiness with flour','Measure success only by height','Rest, gentle handling, appropriate fermentation, and realistic expectations make the grain easier to work with.')
    ]},
    m5: {title:'Ancient Grain Sourdough Starter',questions:[
      q('What does a starter float test primarily reveal?','Whether the sample retained enough gas to float','Whether every microorganism is healthy','Whether the starter has no gluten','Its exact fermentation temperature','Activity and gas retention are not the same thing.'),
      q('What parts remain when you mill and keep the whole berry?','Bran, germ, and endosperm','Only endosperm','Only bran','Only germ','Each component can affect hydration, structure, flavor, and fermentation.'),
      q('What does bran do in a fresh whole-grain starter?','Bind water and interfere with gluten development','Guarantee a taller elastic dome','Remove all enzymes','Stop fermentation','Bran changes the relationship between water and the dough structure.'),
      q('A whole-grain starter looks different after changing flour. What should you do?','Observe its activity and learn the new grain’s pattern','Assume it is dead immediately','Add sugar regardless of the formula','Judge it only by the old jar height','Changing the grain changes the system, not just the flavor.'),
      q('What starter blend does the lesson suggest for introducing an ancient grain?','25% ancient grain and 75% hard white or hard red wheat','100% ancient grain as a required first step','75% salt and 25% flour','Only rye regardless of the grain being studied','A familiar structural base helps you observe changes gradually.'),
      q('Why hold temperature steady while testing a new grain?','To avoid confusing grain effects with temperature effects','To prevent any fermentation','To change the wheat’s genetics','To remove bran from the flour','Change one variable at a time so you can learn what caused the difference.'),
      q('Which appearance can fit an active einkorn starter?','Tiny bubbles and a modest, spreading rise','Only a tall rigid dome','No bubbles and no changes','An identical texture to every rye starter','The lesson also describes softness and a buttery aroma; height alone is not the whole story.'),
      q('Which pattern can fit a spelt starter?','A dome that relaxes fairly quickly after peak','A permanently rigid dome','No extensibility','No need to observe timing','Spelt can be silky and extensible while losing surface tension quickly at peak.'),
      q('Why can a rye starter look like a thick paste?','Its structure depends strongly on starch and water-binding arabinoxylans','Rye forms the same elastic network as bread wheat','Rye has no fermentation activity','It contains no water','Read rye as rye rather than expecting wheat-style stretching and doming.'),
      q('What structural role can acidity play in high-rye bread?','Slow amylase activity that would otherwise weaken starch structure','Remove all gluten','Replace the starch with protein','Guarantee that the float test passes','With rye, sourdough can do structural work as well as add flavor.')
    ]},
    bonus: {title:'Waking Up the Berry',questions:[
      q('What is a wheat berry before milling?','A seed','A flour additive','A finished loaf','A sourdough culture','Water and suitable conditions can start germination.'),
      q('Which order matches the lesson’s sprouting process?','Soak, rinse, short tail, dry, mill','Mill, soak, bake, sprout','Dry, mill, then rinse','Sprout, mill wet, then dry','Dry the sprouted berries completely before milling.'),
      q('How long does the lesson suggest soaking berries in cool water?','8–12 hours','Five minutes','Five days without draining','Until a long green shoot grows','After soaking, drain and rinse; do not leave berries sitting in standing water.'),
      q('How often does the lesson suggest rinsing during sprouting?','Two or three times a day','Only once at the beginning','Never after soaking','Once a week','Use clean equipment, drain well, and follow the lesson’s process.'),
      q('When does the lesson suggest stopping sprout growth?','At a tiny pinhead-sized tail','When long green leaves appear','Only after roots fill the jar','When every berry splits into flour','Long sprouts can bring grassy flavor and weaker dough.'),
      q('What should you do if a berry smashes rather than shatters under the flat of a knife?','Continue drying before milling','Mill it immediately','Add water before milling','Mix it into dry flour to hide the moisture','The lesson uses this check to distinguish wet berries from fully dried berries.'),
      q('Why avoid milling wet sprouted berries?','They can gum up a mill','They contain no starch','They remove the mill’s power source','They become salt','Dry completely and follow your mill manufacturer’s instructions.'),
      q('What does amylase do?','Break starch into smaller sugars','Build gluten directly','Remove every mineral','Turn salt into yeast','Useful enzyme activity can contribute sweetness and fermentation food; excess starch breakdown can cause problems.'),
      q('What can too much starch breakdown contribute to?','A sticky, gummy crumb','Guaranteed stronger dough','No fermentation','A flour with no water absorption','Sprouted flour calls for attention to enzyme activity and fermentation.'),
      q('What initial sprouted-flour proportion does the lesson recommend?','20–30% of the flour','100% in every formula','No flour at all','Exactly 90% for every bread','Start small and keep familiar flour for the remaining structure.'),
      q('What should guide fermentation after adding sprouted flour?','The dough’s activity and condition','Only the previous recipe’s clock','The color of the mixing bowl','A promise that fermentation will always take longer','Check early; sprouted flour can change fermentation speed.'),
      q('Which bakes does the lesson describe as relatively forgiving starting places?','Muffins, pancakes, and quick breads','Every long-proof 100% lean loaf','Only high-rye sourdough','Any formula without testing','These bakes avoid a long fermentation period during which enzymes keep working.'),
      q('Does the lesson claim sprouted flour is proven to improve every starter?','No; it proposes a controlled comparison','Yes; it guarantees a better culture','Yes; it replaces all observation','Only if both jars use different temperatures','Compare jars with the same culture, feeding, and conditions while changing the flour.'),
      q('How should a sprouted-grain experiment control its variables?','Keep conditions the same and change the flour being compared','Change flour, temperature, and feeding ratio together','Use different starter amounts and ignore timing','Judge only by the jar label','A controlled comparison makes your observations more useful.'),
      q('Why be cautious with sprouted flour in a long-proof high-rye loaf?','Enzymes have longer to break down starch','Sprouting removes every enzyme','Longer proofing guarantees a stronger starch structure','Rye becomes modern wheat during proofing','The lesson advises particular care with long fermentations where starch breakdown can weaken structure.')
    ]}
  };
})();
