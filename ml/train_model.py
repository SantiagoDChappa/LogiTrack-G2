import pandas as pd
import joblib
import os
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix, classification_report,
    mean_absolute_error, mean_squared_error, r2_score
)

# ── Carga de datos ─────────────────────────────────────────────────────────────

def load_data():
    df = pd.read_csv('dataset/shipments.csv')

    drop_cols = ['tracking_id', 'sender', 'recipient']
    df = df.drop(columns=drop_cols)

    df = pd.get_dummies(df, columns=['origin_province', 'destination_province'])

    # X comparte las mismas features para ambos modelos
    X = df.drop(columns=['delayed', 'delivery_days'])
    y_delayed       = df['delayed']        # target clasificacion
    y_delivery_days = df['delivery_days']  # target regresion

    return X, y_delayed, y_delivery_days

# ── Modelo 1: Clasificacion (demorado si/no) ───────────────────────────────────

def train_classifier(X, y):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        random_state=42,
        class_weight='balanced'
    )
    model.fit(X_train, y_train)

    return model, X_test, y_test

def evaluate_classifier(model, X_test, y_test):
    y_pred  = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    print('=' * 50)
    print('  MODEL 1 — Delay Classifier (yes/no)')
    print('=' * 50)
    print(f'  Accuracy  : {accuracy_score(y_test, y_pred):.4f}')
    print(f'  Precision : {precision_score(y_test, y_pred):.4f}')
    print(f'  Recall    : {recall_score(y_test, y_pred):.4f}')
    print(f'  F1-Score  : {f1_score(y_test, y_pred):.4f}')
    print(f'  ROC-AUC   : {roc_auc_score(y_test, y_proba):.4f}')
    print()
    print(classification_report(y_test, y_pred, target_names=['On time', 'Delayed']))

    cm = confusion_matrix(y_test, y_pred)
    print(f'  Confusion matrix:')
    print(f'    [TN={cm[0,0]}  FP={cm[0,1]}]')
    print(f'    [FN={cm[1,0]}  TP={cm[1,1]}]')
    print('=' * 50)

# ── Modelo 2: Regresion (cuantos dias tarda) ───────────────────────────────────

def train_regressor(X, y):
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=100,
        max_depth=10,
        random_state=42
    )
    model.fit(X_train, y_train)

    return model, X_test, y_test

def evaluate_regressor(model, X_test, y_test):
    y_pred = model.predict(X_test)

    mae  = mean_absolute_error(y_test, y_pred)
    rmse = mean_squared_error(y_test, y_pred) ** 0.5
    r2   = r2_score(y_test, y_pred)

    print()
    print('=' * 50)
    print('  MODEL 2 — Delivery Days Regressor')
    print('=' * 50)
    print(f'  MAE  (avg error in days) : {mae:.2f}')
    print(f'  RMSE (penalizes big err) : {rmse:.2f}')
    print(f'  R2   (fit quality 0-1)   : {r2:.4f}')
    print('=' * 50)

# ── Guardado ───────────────────────────────────────────────────────────────────

def save_models(classifier, regressor, columns):
    os.makedirs('model', exist_ok=True)
    joblib.dump(classifier, 'model/delay_model.pkl')
    joblib.dump(regressor,  'model/days_model.pkl')
    joblib.dump(columns,    'model/columns.pkl')
    print('  Classifier saved : model/delay_model.pkl')
    print('  Regressor saved  : model/days_model.pkl')
    print('  Columns saved    : model/columns.pkl')

# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print('Loading dataset...')
    X, y_delayed, y_days = load_data()
    print(f'  Rows: {len(X)}  |  Delayed: {y_delayed.sum()} ({y_delayed.mean()*100:.1f}%)  |  Avg days: {y_days.mean():.1f}')

    print('\nTraining classifier (delayed yes/no)...')
    classifier, X_test_c, y_test_c = train_classifier(X, y_delayed)

    print('\nEvaluating classifier...')
    evaluate_classifier(classifier, X_test_c, y_test_c)

    print('\nTraining regressor (delivery days)...')
    regressor, X_test_r, y_test_r = train_regressor(X, y_days)

    print('\nEvaluating regressor...')
    evaluate_regressor(regressor, X_test_r, y_test_r)

    print('\nSaving models...')
    save_models(classifier, regressor, list(X.columns))
