import pandas as pd
import sys

xls = pd.ExcelFile(r'C:\Users\redi_\Downloads\CONTACTOS .xlsx')
sql_statements = []

for sheet in ['PRIME', 'KIDS']:
    df = pd.read_excel(xls, sheet)
    df.columns = df.columns.str.strip()
    
    for _, row in df.iterrows():
        if 'NOMBRE' not in row or 'TELEFONO' not in row:
            continue
            
        if pd.isna(row['NOMBRE']) or pd.isna(row['TELEFONO']):
            continue
            
        nombre = str(row['NOMBRE']).strip().replace("'", "''")
        tel = str(row['TELEFONO']).strip().replace(' ', '')
        
        # Parse common characters in phone numbers
        tel = tel.replace('-', '').replace('(', '').replace(')', '').replace('+', '')
        
        # Format the phone number (assuming Mexico, prepending 521 if it's 10 digits)
        if len(tel) == 10 and tel.isdigit():
            tel = "521" + tel
            
        curso = ''
        if 'CURSO' in row and not pd.isna(row['CURSO']):
            curso = str(row['CURSO']).strip().replace("'", "''")
            
        sql = f"INSERT INTO prospectos (nombre, telefono, curso_interes, canal) VALUES ('{nombre}', '{tel}', '{curso}', 'importacion') ON CONFLICT (telefono) DO UPDATE SET curso_interes = EXCLUDED.curso_interes;"
        sql_statements.append(sql)

with open('migration_contactos.sql', 'w', encoding='utf-8-sig') as f:
    f.write('-- Migración generada a partir de CONTACTOS .xlsx\n')
    f.write('BEGIN;\n')
    f.write('\n'.join(sql_statements))
    f.write('\nCOMMIT;\n')
    
print("SQL Migration file created successfully at migration_contactos.sql")
