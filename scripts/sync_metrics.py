import os
import json
import logging
from datetime import datetime
import gspread
import pandas as pd
from google.oauth2.service_account import Credentials
from dotenv import load_dotenv

# Configurar logs
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)

# Cargar variables de entorno
load_dotenv()

def parse_date(date_str):
    if not date_str:
        return None
    date_str = str(date_str).strip()
    for fmt in ('%d/%m/%Y', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%m/%d/%Y'):
        try:
            return pd.to_datetime(date_str, format=fmt, dayfirst=True).strftime('%Y-%m-%d')
        except:
            continue
    try:
        return pd.to_datetime(date_str, dayfirst=True).strftime('%Y-%m-%d')
    except:
        return None

def parse_numeric(val):
    if val is None or val == "":
        return 0.0
    val_str = str(val).strip()
    val_str = val_str.replace('$', '').replace(' ', '').replace('%', '')
    
    # Manejar formatos de miles/decimales: "." para miles y "," para decimales, o al revés.
    if ',' in val_str and '.' in val_str:
        if val_str.find(',') > val_str.find('.'):
            # Formato 1.234.567,89
            val_str = val_str.replace('.', '').replace(',', '.')
        else:
            # Formato 1,234,567.89
            val_str = val_str.replace(',', '')
    elif ',' in val_str:
        # Formato 1234,56
        parts = val_str.split(',')
        if len(parts[-1]) == 3: # Si tiene 3 dígitos, podría ser separador de miles sin decimales
            val_str = val_str.replace(',', '')
        else:
            val_str = val_str.replace(',', '.')
    
    try:
        return float(val_str)
    except ValueError:
        try:
            # Reemplazar cualquier punto restante en caso de que fuera separador de miles
            return float(val_str.replace('.', ''))
        except ValueError:
            return 0.0

def find_worksheet_by_partial_title(sh, part):
    worksheets = sh.worksheets()
    for ws in worksheets:
        # Comparación insensible a mayúsculas/minúsculas y que remueva tildes para mayor robustez
        title_norm = ws.title.lower().replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
        part_norm = part.lower().replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
        if part_norm in title_norm:
            return ws
    raise Exception(f"No worksheet matching '{part}' found.")

def main():
    logging.info("Starting synchronization process with Google Sheets...")
    
    # 1. Obtener credenciales y configurar cliente
    cred_file = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "credentials.json")
    if not os.path.exists(cred_file):
        logging.error(f"Credentials file '{cred_file}' not found. Cannot proceed.")
        return
        
    scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    creds = Credentials.from_service_account_file(cred_file, scopes=scopes)
    client = gspread.authorize(creds)
    
    # 2. Conectar al Spreadsheet
    sheet_id = os.getenv("SPREADSHEET_ID", "1ggeuKuCFZsUpDfRl2wPLOqWD2in7uL9Y3yHTaui_A0w")
    try:
        sh = client.open_by_key(sheet_id)
        logging.info(f"Connected to Spreadsheet: {sh.title}")
    except Exception as e:
        logging.error(f"Failed to connect to Spreadsheet with ID {sheet_id}: {e}")
        return

    # 3. Extraer y procesar cada pestaña
    data_out = {}
    
    # --- Pestaña 1: base de datos ---
    try:
        ws_base = find_worksheet_by_partial_title(sh, "base de datos")
        records = ws_base.get_all_records()
        processed_base = []
        for r in records:
            # Obtener claves ignorando tildes y espacios
            row_dict = {}
            for k, v in r.items():
                k_norm = k.strip().lower().replace('í', 'i').replace('ó', 'o').replace('é', 'e').replace('á', 'a').replace('ú', 'u')
                if 'periodo' in k_norm:
                    row_dict['periodo'] = parse_date(v)
                elif 'subtipo' in k_norm:
                    row_dict['subtipo'] = str(v).strip()
                elif 'tipo' in k_norm:
                    row_dict['tipo'] = str(v).strip()
                elif 'categoria' in k_norm:
                    row_dict['categoria'] = str(v).strip()
                elif 'monto' in k_norm:
                    row_dict['monto'] = parse_numeric(v)
            
            # Validar campos requeridos
            if row_dict.get('periodo') and row_dict.get('tipo'):
                processed_base.append(row_dict)
                
        data_out['base_de_datos'] = processed_base
        logging.info(f"Processed {len(processed_base)} rows from 'base de datos'.")
    except Exception as e:
        logging.error(f"Error processing 'base de datos': {e}")
        data_out['base_de_datos'] = []

    # --- Pestaña 2: Expedientes ---
    try:
        ws_exp = find_worksheet_by_partial_title(sh, "Expedientes")
        records = ws_exp.get_all_records()
        processed_exp = []
        for r in records:
            row_dict = {}
            for k, v in r.items():
                k_norm = k.strip().lower()
                if k_norm == 'fecha':
                    row_dict['fecha'] = parse_date(v)
                elif 'comunes' in k_norm:
                    row_dict['comunes'] = int(parse_numeric(v))
                elif 'ccu' in k_norm:
                    row_dict['ccu'] = int(parse_numeric(v))
                elif 'vep' in k_norm:
                    row_dict['vep'] = int(parse_numeric(v))
                elif 'total' in k_norm:
                    row_dict['total'] = int(parse_numeric(v))
            
            # Si no hay TOTAL, lo recalculamos
            if 'total' not in row_dict or row_dict['total'] == 0:
                row_dict['total'] = row_dict.get('comunes', 0) + row_dict.get('ccu', 0) + row_dict.get('vep', 0)
                
            if row_dict.get('fecha'):
                processed_exp.append(row_dict)
                
        data_out['expedientes'] = processed_exp
        logging.info(f"Processed {len(processed_exp)} rows from 'Expedientes'.")
    except Exception as e:
        logging.error(f"Error processing 'Expedientes': {e}")
        data_out['expedientes'] = []

    # --- Pestaña 3: Rendición VEP_SCIT ---
    try:
        ws_vep = find_worksheet_by_partial_title(sh, "VEP_SCIT")
        records = ws_vep.get_all_records()
        processed_vep = []
        for r in records:
            row_dict = {}
            for k, v in r.items():
                k_norm = k.strip().lower()
                if k_norm == 'fecha':
                    row_dict['fecha'] = parse_date(v)
                elif k_norm == 'tipo':
                    row_dict['tipo'] = str(v).strip()
                elif k_norm == 'concepto':
                    row_dict['concepto'] = str(v).strip()
                elif k_norm == 'monto':
                    row_dict['monto'] = parse_numeric(v)
                    
            if row_dict.get('fecha') and row_dict.get('tipo'):
                processed_vep.append(row_dict)
                
        data_out['rendicion_vep_scit'] = processed_vep
        logging.info(f"Processed {len(processed_vep)} rows from 'Rendición VEP_SCIT'.")
    except Exception as e:
        logging.error(f"Error processing 'Rendición VEP_SCIT': {e}")
        data_out['rendicion_vep_scit'] = []

    # --- Pestaña 4: Capital financiero ---
    try:
        ws_cap = find_worksheet_by_partial_title(sh, "Capital financiero")
        records = ws_cap.get_all_records()
        processed_cap = []
        for r in records:
            row_dict = {}
            for k, v in r.items():
                k_norm = k.strip().lower().replace('í', 'i').replace('ó', 'o').replace('é', 'e').replace('á', 'a').replace('ú', 'u')
                if 'tipo de activo' in k_norm or 'tipo_activo' in k_norm:
                    row_dict['tipo_activo'] = str(v).strip()
                elif 'fecha_constitucion' in k_norm or 'fecha_constitu' in k_norm:
                    row_dict['fecha_constitucion'] = parse_date(v)
                elif 'fecha_vencimiento' in k_norm or 'fecha_venc' in k_norm:
                    row_dict['fecha_vencimiento'] = parse_date(v)
                elif k_norm == 'moneda':
                    row_dict['moneda'] = str(v).strip()
                elif k_norm == 'capital':
                    row_dict['capital'] = parse_numeric(v)
                elif 'interes' in k_norm:
                    row_dict['interes'] = parse_numeric(v)
                elif 'monto final' in k_norm or 'monto_final' in k_norm or 'final a cobrar' in k_norm:
                    row_dict['monto_final'] = parse_numeric(v)
                elif 'tna' in k_norm:
                    row_dict['tna'] = parse_numeric(v)
                elif k_norm == 'plazo':
                    row_dict['plazo'] = int(parse_numeric(v))
                elif k_norm == 'entidad':
                    row_dict['entidad'] = str(v).strip()
            
            # Si no tiene fecha de vencimiento pero sí de constitución y plazo, la calculamos
            if not row_dict.get('fecha_vencimiento') and row_dict.get('fecha_constitucion') and row_dict.get('plazo'):
                try:
                    start_dt = datetime.strptime(row_dict['fecha_constitucion'], '%Y-%m-%d')
                    end_dt = start_dt + pd.Timedelta(days=row_dict['plazo'])
                    row_dict['fecha_vencimiento'] = end_dt.strftime('%Y-%m-%d')
                except:
                    pass
            
            # Recalcular monto final si no existe
            if 'monto_final' not in row_dict or row_dict['monto_final'] == 0:
                row_dict['monto_final'] = row_dict.get('capital', 0.0) + row_dict.get('interes', 0.0)

            if row_dict.get('tipo_activo') and row_dict.get('fecha_constitucion'):
                processed_cap.append(row_dict)
                
        data_out['capital_financiero'] = processed_cap
        logging.info(f"Processed {len(processed_cap)} rows from 'Capital financiero'.")
    except Exception as e:
        logging.error(f"Error processing 'Capital financiero': {e}")
        data_out['capital_financiero'] = []

    # 4. Guardar archivo final
    data_out['last_updated'] = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
    
    # Crear directorio si no existe
    os.makedirs('src/data', exist_ok=True)
    out_file_json = 'src/data/metrics.json'
    out_file_js = 'src/data/metrics.js'
    
    try:
        # Guardar JSON puro
        with open(out_file_json, 'w', encoding='utf-8') as f:
            json.dump(data_out, f, ensure_ascii=False, indent=2)
            
        # Guardar JS con variable global para evitar problemas de CORS local (file://)
        with open(out_file_js, 'w', encoding='utf-8') as f:
            f.write("const dashboardData = ")
            json.dump(data_out, f, ensure_ascii=False, indent=2)
            f.write(";\n")
            
        logging.info(f"[SUCCESS] Sync completed. Metrics saved to '{out_file_json}' and '{out_file_js}'.")
    except Exception as e:
        logging.error(f"Failed to write output files: {e}")

if __name__ == "__main__":
    main()
