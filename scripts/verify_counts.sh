#!/bin/bash
sudo -u postgres psql -d altrix -c "
SELECT 
    'Beacon Main' as campus, 
    (SELECT count(1) FROM user_roles WHERE campus_id = '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8' AND role != 'student' AND role != 'parent') as staff, 
    (SELECT count(1) FROM crm_leads WHERE campus_id = '249bfc5e-f7c2-4103-bef1-ec4bdae2cdd8') as leads
UNION ALL 
SELECT 
    'Beacon Lahore', 
    (SELECT count(1) FROM user_roles WHERE campus_id = 'a847833c-90a7-4f25-b793-8a813eee2215' AND role != 'student' AND role != 'parent'), 
    (SELECT count(1) FROM crm_leads WHERE campus_id = 'a847833c-90a7-4f25-b793-8a813eee2215');
"
