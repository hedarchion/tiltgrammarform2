/* Easy practice from the KSSM Form 1 Pulse 2 Units 1–5 grammar scope.
 * Source: https://anyflip.com/iowpp/goxm/basic/51-76 (DSKP pp. 50–55).
 * Deliberately limited to core topics; no requirement to cover every syllabus item.
 */
const fs = require('node:fs');
const {createHash} = require('node:crypto');
const names = ['Aina','Adam','Siti','Amir','Mei','Ravi','Sara','Ali','Nina','Ben','Lina','Dan','Maya','Sam','Hana','Tim','Irfan','Zara','Lily','Ryan'];
const patterns = {
'Present Simple': [
['{n} {x} milk every morning.','drink|drinks|drinking','Use drinks with one person for a daily habit.'],
['{n} {x} to school every day.','go|goes|going','Use goes with one person for a daily routine.'],
['{n} does not {x} football.','plays|play|playing','After does not, use the base verb: play.'],
['Does {n} {x} cats?','likes|like|liking','After does, use the base verb: like.'],
['{n} and I {x} books every day.','reads|read|reading','Use read with a plural subject: two people.']],
'Present Continuous': [
['{n} is {x} a book now.','read|reading|reads','Use is + verb-ing for an action happening now.'],
['{n} is {x} lunch at the moment.','eat|eating|eats','Use is eating for an action happening now.'],
['{n} {x} playing outside now.','are|is|am','Use is with one person in the present continuous.'],
['{n} and I {x} watching TV now.','is|are|am','Use are with a plural subject in the present continuous.'],
['Is {n} {x} to music now?','listen|listening|listens','Use listening after is in this question.']],
'Past Simple': [
['{n} {x} to the park yesterday.','walk|walked|walking','Yesterday tells us to use the past simple: walked.'],
['{n} {x} a game last night.','play|played|playing','Use played for a finished action last night.'],
['{n} {x} rice yesterday.','eat|ate|eating','The past simple of eat is ate.'],
['{n} did not {x} TV last night.','watched|watch|watching','After did not, use the base verb: watch.'],
['Did {n} {x} to school yesterday?','went|go|going','After did, use the base verb: go.']],
'Past Continuous': [
['{n} {x} sleeping at ten last night.','were|was|is','Use was + verb-ing with one person at a past time.'],
['{n} and I {x} reading at eight last night.','was|were|are','Use were + verb-ing with a plural subject at a past time.'],
['{n} was {x} when the phone rang.','cook|cooking|cooks','Use was cooking for the action in progress.'],
['{n} was {x} when it started to rain.','walk|walking|walks','Use was walking for the action already in progress.'],
['{n} was {x} a film at nine last night.','watch|watching|watches','Use was watching for an action in progress at a past time.']],
'Comparatives': [
['{n} is {x} than me.','tall|taller|tallest','Use taller with than to compare two people.'],
['{n} has a {x} bag than mine.','small|smaller|smallest','Use smaller with than to compare two bags.'],
['{n} runs {x} than me.','fast|faster|fastest','Use faster with than to compare two runners.'],
['{n} is {x} than my brother.','young|younger|youngest','Use younger with than to compare two people.'],
['{n} has a {x} box than mine.','big|bigger|biggest','Double the g and add -er: big becomes bigger.']],
'Superlatives': [
['{n} is the {x} pupil in the class.','tall|tallest|taller','Use the tallest to compare one pupil with the whole class.'],
['{n} has the {x} bag of all.','small|smallest|smaller','Use the smallest when comparing all the bags.'],
['{n} is the {x} runner in the team.','fast|fastest|faster','Use the fastest to compare one runner with the whole team.'],
['{n} is the {x} child in the family.','young|youngest|younger','Use the youngest when comparing the whole family.'],
['{n} has the {x} box of all.','big|biggest|bigger','Double the g and add -est: big becomes biggest.']],
'Articles': [
['{n} has {x} apple.','a|an|any','Use an before the vowel sound at the start of apple.'],
['{n} has {x} book.','an|a|any','Use a before the consonant sound at the start of book.'],
['{n} sees {x} elephant.','a|an|some','Use an before the vowel sound at the start of elephant.'],
['{n} wears {x} blue hat.','an|a|any','Use a before the consonant sound at the start of blue.'],
['{n} eats {x} orange.','a|an|some','Use an before the vowel sound at the start of orange.']],
'Some and Any': [
['{n} has {x} apples.','a|some|an','Use some with plural nouns in a positive sentence.'],
['{n} does not have {x} pencils.','a|any|an','Use any with plural nouns in a negative sentence.'],
['Does {n} have {x} water?','a|any|an','Use any with water in this neutral question.'],
['{n} bought {x} rice.','a|some|an','Rice is uncountable. Use some in a positive sentence.'],
['{n} does not have {x} milk.','a|any|an','Milk is uncountable. Use any in a negative sentence.']],
'Much and Many': [
['How {x} books does {n} have?','much|many|any','Use many with countable plural nouns such as books.'],
['How {x} water does {n} need?','many|much|some','Use much with uncountable nouns such as water.'],
['{n} does not have {x} money.','many|much|a','Use much with money, which is uncountable.'],
['How {x} apples did {n} buy?','much|many|some','Use many with countable plural nouns such as apples.'],
['How {x} milk does {n} drink?','many|much|any','Use much with milk, which is uncountable.']],
'Countable Nouns': [
['{n} has two {x}.','book|books|bookes','Add -s for more than one book: two books.'],
['{n} has three {x}.','box|boxes|boxs','Add -es to box for the plural: three boxes.'],
['{n} has four {x}.','apple|apples|appleses','Add -s for more than one apple: four apples.'],
['{n} sees two {x} in the park.','child|children|childs','The plural of child is children.'],
['{n} has five {x}.','pencil|pencils|penciles','Add -s for more than one pencil: five pencils.']]
};
const bank = [];
for (const [topic, rows] of Object.entries(patterns)) for (const [pattern, forms, tip] of rows) for (const name of names) {
 const s = pattern.replaceAll('{n}', name);
 const [w,c,f] = forms.split('|');
 const answer = bank.length % 2;
 bank.push({id:'f1_'+createHash('sha256').update(topic+'\0'+s).digest('hex').slice(0,16),topic,s,w,c,f,tip,options:answer?[f,c]:[c,f],answer});
}
fs.writeFileSync('questions-form1.js', '/* Generated by scripts/build-form1.cjs */\nwindow.BANK_FORM1 = '+JSON.stringify(bank,null,2)+';\n');
console.log(`Built ${bank.length} Form 1 questions.`);
