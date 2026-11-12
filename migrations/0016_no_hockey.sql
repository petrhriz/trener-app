-- Hokej se v aplikaci nerozlišuje: aktivity hokeje jsou „Ostatní“, omezení „hokej“ v plánu už neexistuje.
UPDATE activities SET sport = 'other' WHERE sport = 'hockey';
UPDATE activities SET quality_type = NULL WHERE quality_type = 'hockey';
UPDATE constraints SET kind = 'nemuzu' WHERE kind = 'hokej';
