"""Regression checks for known word-boundary mistakes before bulk ad edits."""
from sojam_intent_policy import classify
cases={
 '연수건선한의원':'HOLD_SCOPE',
 '상록수건선치료':'HOLD_SCOPE',
 '수건선물':'X_OTHER',
 '지루성피부염샴푸추천':'X_PRODUCT',
 '야간진료아토피한의원':'A',
 '관악화폐상습진한의원':'A',
 '만성아토피치료':'S',
 '습진진물치료':'S',
 '아토피연고':'D_INFO',
 '소잠한의원':'BRAND',
 '아토피광선치료기기':'X_PRODUCT',
 '할리퀸어린선완치':'MEDICAL',
 '화폐상습진대학병원':'PROVIDER_SCOPE',
 '비듬치료의약품':'D_INFO',
 '눈간지러움병원':'AUX_SCOPE',
}
for keyword,expected in cases.items():assert classify(keyword)['grade']==expected,(keyword,classify(keyword))
assert not classify('아토피보습제알레르기')['grade'].startswith('X_')
assert not classify('패치검사피부염')['grade'].startswith('X_')
print('17 semantic boundary checks passed')
