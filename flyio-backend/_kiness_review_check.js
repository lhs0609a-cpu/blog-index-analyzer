const assert=require('assert');const {evaluate}=require('./_kiness_review_rubric');
const cases=[['키네스강남상담','A'],['키네스가격','A'],['키네스평균키','E'],['강남성장클리닉','B'],['목동성장클리닉','B'],['부산성장클리닉','B'],['고덕성장클리닉','C'],['광주성장클리닉','C'],['대전성장클리닉','F'],['성장클리닉','C'],['성장판검사비용','C'],['성장판검사방법','E'],['성장판닫히는시기','E'],['키가안커요','D'],['초등학생키크는법','E'],['중3평균키','E'],['키네스채용','I'],['성인키크는법','I'],['부산키성장한의원','H'],['소아비만치료','H'],['성장호르몬주사','H'],['키성장영양제','G'],['키크는운동기구','G'],['키커지는법','E']];
for(const [k,c] of cases)assert.equal(evaluate(k).category,c,k);
assert(evaluate('강남성장클리닉').priority_score>evaluate('키크는방법').priority_score);
assert(evaluate('대전성장클리닉').pc5_protected);
assert(evaluate('고덕성장클리닉').geo_zone==='ambiguous');
assert(!evaluate('성장클리닉').pc5_protected);
assert(evaluate('키네스가격').score_is_probability===false);
console.log('Rubric scenario checks passed: '+cases.length+' categories + 5 boundary checks.');
