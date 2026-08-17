#!/bin/bash
sudo -u postgres psql -d altrix -c "SELECT ur.user_id, ur.role, ur.campus_id, c.name FROM user_roles ur LEFT JOIN campuses c ON c.id = ur.campus_id WHERE ur.school_id = '70b40b4e-ae36-4c1e-82b0-61e08dc5d4d8';"
